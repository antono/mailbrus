use crate::{cli::LogLevel, state::AppState};
use axum::{
    extract::State,
    http::{header::CACHE_CONTROL, HeaderValue, Request},
    middleware::Next,
    response::Response,
};
use tracing::{debug, info, warn};

/// Mark every API response `Cache-Control: no-store`.
///
/// API payloads (maildirs, folders, message lists) are dynamic — they change on
/// every sync. Without this header the browser's HTTP cache may serve a stale
/// response (e.g. an empty inbox captured before the first sync), which looks
/// like data loss. The notmuch index is the single source of truth, so API
/// responses must never be cached by the browser.
pub async fn no_store_middleware(req: Request<axum::body::Body>, next: Next) -> Response {
    let mut res = next.run(req).await;
    res.headers_mut()
        .insert(CACHE_CONTROL, HeaderValue::from_static("no-store"));
    res
}

pub async fn log_middleware(
    State(state): State<AppState>,
    req: Request<axum::body::Body>,
    next: Next,
) -> Response {
    let method = req.method().to_string();
    let uri = req.uri().to_string();

    let res = next.run(req).await;
    let status = res.status();

    match state.log_level {
        LogLevel::Debug => {
            debug!("[api] {} {} -> {}", method, uri, status);
        }
        LogLevel::Info => {
            info!("[api] {} {} -> {}", method, uri, status);
        }
        LogLevel::Warn => {
            if status.is_server_error() || status.is_client_error() {
                warn!("[api] {} {} -> {}", method, uri, status);
            }
        }
    }

    res
}
