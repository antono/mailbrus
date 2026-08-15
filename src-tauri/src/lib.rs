/// Generate a per-launch bearer token: 256 bits of OS randomness, hex-encoded to
/// a 64-char string. The desktop shell hands this to the `mailbrus-server`
/// sidecar via `--auth` and injects it into the webview so the SPA authenticates
/// automatically. Compiled for release builds and tests only (dev is token-less).
#[cfg(any(not(dev), test))]
fn generate_auth_token() -> String {
    let mut bytes = [0u8; 32];
    getrandom::getrandom(&mut bytes).expect("failed to generate auth token");
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// Reserve an ephemeral loopback port, then release it for the sidecar to bind.
/// Using a fresh port per launch (instead of a hardcoded one) means a stale
/// server left over from a previous run can never hijack the port and answer the
/// webview with a mismatched token.
#[cfg(not(dev))]
fn reserve_free_port() -> u16 {
    std::net::TcpListener::bind("127.0.0.1:0")
        .and_then(|l| l.local_addr())
        .map(|addr| addr.port())
        .expect("failed to reserve a local port")
}

/// Resolve the bundled `mailbrus-server` sidecar path. We spawn it ourselves
/// (rather than via tauri-plugin-shell) so we can attach a `pre_exec` hook, so
/// this replicates the plugin's sidecar lookup across the bundle layouts we ship:
/// the Nix package puts it under `<resource_dir>/binaries/`, a `cargo tauri`
/// bundle next to the executable.
#[cfg(not(dev))]
fn sidecar_path(app: &tauri::App) -> std::path::PathBuf {
    use tauri::Manager;
    let named = format!("mailbrus-server-{}", env!("TAURI_ENV_TARGET_TRIPLE"));
    let mut candidates: Vec<std::path::PathBuf> = Vec::new();
    if let Ok(res) = app.path().resource_dir() {
        candidates.push(res.join("binaries").join(&named));
        candidates.push(res.join(&named));
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.join(&named));
            candidates.push(dir.join("mailbrus-server"));
        }
    }
    candidates
        .into_iter()
        .find(|p| p.exists())
        .expect("mailbrus-server sidecar binary not found")
}

/// Holds the sidecar process so it can be killed when the app exits, preventing
/// orphaned `mailbrus-server` processes from lingering on their port.
#[cfg(not(dev))]
struct SidecarChild(std::sync::Mutex<Option<std::process::Child>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            use tauri::{WebviewUrl, WebviewWindowBuilder};

            // Dev: the server is started by beforeDevCommand on the fixed dev port.
            #[cfg(dev)]
            let server_url: tauri::Url =
                "http://127.0.0.1:1371".parse().expect("valid server URL");

            // Production: own the sidecar on a fresh ephemeral port, mint a
            // per-launch token, hand it to the server via --auth, and inject it
            // into the webview below.
            #[cfg(not(dev))]
            let (server_url, token) = {
                use tauri::Manager;

                let port = reserve_free_port();
                let bind = format!("127.0.0.1:{port}");
                let token = generate_auth_token();
                let resource_dir = app.path().resource_dir().unwrap_or_else(|_| {
                    std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."))
                });
                let frontend_dist = resource_dir.join("build");

                let mut cmd = std::process::Command::new(sidecar_path(app));
                cmd.args([
                    "--bind",
                    &bind,
                    "--frontend-dist",
                    frontend_dist.to_str().unwrap_or("./build"),
                    "--auth",
                    &token,
                ]);

                // Guarantee the sidecar dies with us — even on SIGKILL/crash of
                // the desktop process, which the RunEvent::Exit handler below
                // cannot catch. The kernel sends SIGKILL to the child when our
                // (parent) thread dies. Spawned from Tauri's main thread, which
                // lives for the whole app, so the signal fires at process exit.
                #[cfg(target_os = "linux")]
                unsafe {
                    use std::os::unix::process::CommandExt;
                    cmd.pre_exec(|| {
                        if libc::prctl(
                            libc::PR_SET_PDEATHSIG,
                            libc::SIGKILL as libc::c_ulong,
                            0,
                            0,
                            0,
                        ) == -1
                        {
                            return Err(std::io::Error::last_os_error());
                        }
                        // Race guard: the parent may have died between spawn and
                        // prctl; if so, don't exec — just exit.
                        if libc::getppid() == 1 {
                            libc::_exit(1);
                        }
                        Ok(())
                    });
                }

                let child = cmd
                    .spawn()
                    .expect("failed to spawn mailbrus-server sidecar");

                app.manage(SidecarChild(std::sync::Mutex::new(Some(child))));

                let url: tauri::Url = format!("http://127.0.0.1:{port}")
                    .parse()
                    .expect("valid server URL");
                (url, token)
            };

            // Build the main window in Rust (label "main", matching the Tauri
            // capabilities) so an initialization script can carry the token to
            // the SPA before any of its scripts run.
            #[cfg_attr(dev, allow(unused_mut))]
            let mut builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(server_url))
                .title("mailbrus")
                .inner_size(1200.0, 800.0);

            #[cfg(not(dev))]
            {
                let script = format!(
                    "window.__MAILBRUS_AUTH_TOKEN__ = {};",
                    serde_json::to_string(&token).expect("serialize auth token")
                );
                builder = builder.initialization_script(&script);
            }

            builder.build().expect("failed to build main window");

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building mailbrus-desktop");

    app.run(|_app_handle, _event| {
        // Kill the sidecar when the app exits so it never lingers holding its port.
        #[cfg(not(dev))]
        if let tauri::RunEvent::Exit = _event {
            use tauri::Manager;
            if let Some(state) = _app_handle.try_state::<SidecarChild>() {
                if let Ok(mut guard) = state.0.lock() {
                    if let Some(mut child) = guard.take() {
                        let _ = child.kill();
                    }
                }
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn auth_token_is_unique_64_char_hex() {
        let a = generate_auth_token();
        let b = generate_auth_token();
        assert_eq!(a.len(), 64, "token should be 32 bytes hex-encoded");
        assert!(
            a.chars().all(|c| c.is_ascii_hexdigit()),
            "token should be hex: {a}"
        );
        assert_ne!(a, b, "each call should produce a fresh token");
    }
}
