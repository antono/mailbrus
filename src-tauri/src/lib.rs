#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|_app| {
            // In dev mode the server is started by beforeDevCommand.
            // In production the sidecar is bundled and spawned here.
            #[cfg(not(dev))]
            {
                use tauri::Manager;
                use tauri_plugin_shell::ShellExt;
                let app = _app;
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
                    ])
                    .spawn()
                    .expect("failed to spawn mailbrus-server sidecar");

                app.manage(child);
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running mailbrus-desktop")
}
