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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            use tauri::{WebviewUrl, WebviewWindowBuilder};

            // The webview loads the server over HTTP (not the asset protocol).
            let server_url: tauri::Url =
                "http://127.0.0.1:1371".parse().expect("valid server URL");

            // In dev the server is started by beforeDevCommand, token-less. In a
            // bundled build we own the sidecar: mint a per-launch token, hand it
            // to the server via --auth, and inject it into the webview below.
            #[cfg(not(dev))]
            let token = {
                use tauri::Manager;
                use tauri_plugin_shell::ShellExt;

                let token = generate_auth_token();
                let resource_dir = app.path().resource_dir().unwrap_or_else(|_| {
                    std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."))
                });
                let frontend_dist = resource_dir.join("build");

                let (_rx, child) = app
                    .shell()
                    .sidecar("mailbrus-server")
                    .expect("mailbrus-server sidecar not configured")
                    .args([
                        "--bind",
                        "127.0.0.1:1371",
                        "--frontend-dist",
                        frontend_dist.to_str().unwrap_or("./build"),
                        "--auth",
                        &token,
                    ])
                    .spawn()
                    .expect("failed to spawn mailbrus-server sidecar");

                app.manage(child);
                token
            };

            // Build the main window in Rust (label "main", matching the Tauri
            // capabilities) so an initialization script can carry the token to
            // the SPA before any of its scripts run.
            // `mut` is only used by the release-only injection block below.
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
        .run(tauri::generate_context!())
        .expect("error while running mailbrus-desktop")
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
