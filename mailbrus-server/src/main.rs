mod cli;
mod handlers;
mod middleware;
mod mime;
mod push_poller;
mod sanitize;
mod state;

use axum::{
    routing::{delete, get, patch, post},
    Router,
};
use clap::Parser;
use cli::{browser_url, Cli, LogLevel};
use handlers::{
    maildirs::{list_folders, list_maildirs},
    messages::{
        delete_message, get_cid, get_message, list_messages, open_message_html, patch_message,
        search_messages,
    },
    push::{push_subscribe, push_unsubscribe, push_vapid_key, send_message},
};
use middleware::log_middleware;
use push_poller::spawn_push_poller;
use state::AppState;
use std::net::SocketAddr;
use tower_http::services::{ServeDir, ServeFile};
use tracing::{info, warn};

#[tokio::main]
async fn main() {
    let cli = Cli::parse();

    let env_filter = std::env::var("RUST_LOG").ok().map(|s| s.as_str().to_string());
    let default_level = match cli.log_level {
        LogLevel::Debug => "debug",
        LogLevel::Info => "info",
        LogLevel::Warn => "warn",
    };
    let filter_str = env_filter.as_deref().unwrap_or(default_level);

    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::new(filter_str))
        .init();

    info!("[startup] mailbrus-server starting");
    info!("[startup] log-level: {:?}", cli.log_level);
    let state = AppState::new(cli.log_level);
    spawn_push_poller(state.clone());

    let bind_addr: SocketAddr = cli.bind.parse().unwrap_or_else(|e| {
        eprintln!("error: invalid bind address: {e}");
        std::process::exit(1);
    });

    if !bind_addr.ip().is_loopback() && cli.auth.is_none() {
        warn!("[startup] server is publicly accessible without authentication");
    }

    if !cli.frontend_dist.exists() {
        warn!(
            "[startup] frontend dist {:?} does not exist; GET / will return 404",
            cli.frontend_dist
        );
    }

    let api = Router::new()
        .route("/maildirs", get(list_maildirs))
        .route("/maildirs/{id}/folders", get(list_folders))
        .route("/maildirs/{id}/folders/{folder}/messages", get(list_messages))
        .route("/messages/search", get(search_messages))
        .route("/messages/{id}", get(get_message))
        .route("/messages/{id}", patch(patch_message))
        .route("/messages/{id}", delete(delete_message))
        .route("/messages/{id}/cid/{cid}", get(get_cid))
        .route("/messages/{id}/open-html", post(open_message_html))
        .route("/send", post(send_message))
        .route("/push/vapid-key", get(push_vapid_key))
        .route("/push/subscribe", post(push_subscribe))
        .route("/push/subscribe", delete(push_unsubscribe))
        .layer(axum::middleware::from_fn_with_state(
            state.clone(),
            log_middleware,
        ))
        .with_state(state);

    let index = cli.frontend_dist.join("index.html");
    let serve_dir = ServeDir::new(&cli.frontend_dist).not_found_service(ServeFile::new(&index));

    let app = Router::new().nest("/api", api).fallback_service(serve_dir);

    let listener = tokio::net::TcpListener::bind(bind_addr)
        .await
        .unwrap_or_else(|e| {
            eprintln!("error: cannot bind {bind_addr}: {e}");
            std::process::exit(1);
        });

    info!("[startup] listening on http://{bind_addr}");

    if cli.browser {
        let url = browser_url(listener.local_addr().unwrap_or(bind_addr));
        match open::that_detached(&url) {
            Ok(()) => info!("[startup] opened browser at {url}"),
            Err(e) => warn!("[startup] could not open browser at {url}: {e}"),
        }
    }

    let result = axum::serve(listener, app).await;
    match result {
        Ok(()) => info!("[shutdown] server stopped"),
        Err(e) => warn!("[shutdown] server error: {}", e),
    }
}
