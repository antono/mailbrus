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
        delete_message, get_attachment, get_cid, get_message, list_messages, open_attachment,
        patch_message, search_messages,
    },
    push::{push_subscribe, push_unsubscribe, push_vapid_key, send_message},
    sync::{sync_account, sync_all, sync_stream},
};
use mailbrus_core::config::load_config;
use mailbrus_core::notmuch_db;
use mailbrus_core::sync::SyncEngine;
use middleware::{log_middleware, no_store_middleware};
use push_poller::spawn_push_poller;
use state::AppState;
use std::net::SocketAddr;
use std::sync::Arc;
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

    let accounts = match load_config(cli.config.as_deref()) {
        Ok(a) => {
            info!("[startup] loaded {} account(s) from config", a.len());
            a
        }
        Err(e) => {
            warn!("[startup] failed to load config: {} — continuing without accounts", e);
            Vec::new()
        }
    };

    // Mailbrus owns an isolated notmuch database rooted at
    // `$XDG_DATA_HOME/mailbrus/`. Generate its config and auto-create the
    // database before the sync engine starts; the system `~/.notmuch-config`
    // is never read or written.
    let notmuch_db_path = match notmuch_db::default_db_path() {
        Ok(p) => Some(p),
        Err(e) => {
            warn!("[startup] cannot resolve notmuch database path: {}", e);
            None
        }
    };
    if let Some(db_path) = &notmuch_db_path {
        match notmuch_db::default_config_path() {
            Ok(cfg_path) => {
                let maildir_roots: Vec<std::path::PathBuf> = accounts
                    .iter()
                    .map(|a| {
                        a.imap()
                            .and_then(|imap| imap.maildir_root.clone())
                            .or_else(|| {
                                mailbrus_core::config::default_maildir_root(&a.id)
                            })
                            .unwrap_or_else(|| db_path.join("mail").join(&a.id))
                    })
                    .collect();
                if let Err(e) = notmuch_db::write_config(&cfg_path, db_path, &maildir_roots) {
                    warn!("[startup] failed to write notmuch config: {}", e);
                }
            }
            Err(e) => warn!("[startup] cannot resolve notmuch config path: {}", e),
        }
        if let Err(e) = notmuch_db::ensure_initialized(db_path) {
            warn!("[startup] failed to initialize notmuch database: {}", e);
        } else {
            info!("[startup] notmuch database ready at {}", db_path.display());
        }
    }

    if cli.notmuch_db.is_some() {
        warn!(
            "[startup] --notmuch-db is deprecated and ignored; mailbrus always uses {}",
            notmuch_db_path
                .as_ref()
                .map(|p| p.display().to_string())
                .unwrap_or_else(|| "$XDG_DATA_HOME/mailbrus/".to_string())
        );
    }

    let sync_engine = if accounts.is_empty() {
        warn!("[startup] no accounts configured; sync engine disabled");
        None
    } else {
        match SyncEngine::new(&accounts, None) {
            Ok(engine) => {
                info!("[startup] sync engine initialized");
                Some(Arc::new(engine))
            }
            Err(e) => {
                warn!("[startup] failed to init sync engine: {}", e);
                None
            }
        }
    };

    let state = AppState::new(
        cli.log_level,
        accounts,
        sync_engine,
        notmuch_db_path,
    );
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
        .route("/messages/{id}/attachments/{index}", get(get_attachment))
        .route("/messages/{id}/attachments/{index}/open", post(open_attachment))
        .route("/send", post(send_message))
        .route("/push/vapid-key", get(push_vapid_key))
        .route("/push/subscribe", post(push_subscribe))
        .route("/push/subscribe", delete(push_unsubscribe))
        .route("/sync", post(sync_all))
        .route("/sync/{account}", post(sync_account))
        .route("/sync/stream", get(sync_stream))
        .layer(axum::middleware::from_fn_with_state(
            state.clone(),
            log_middleware,
        ))
        .layer(axum::middleware::from_fn(no_store_middleware))
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
