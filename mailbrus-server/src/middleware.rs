use crate::{cli::LogLevel, state::AppState};
use axum::{
    extract::State,
    http::Request,
    middleware::Next,
    response::Response,
};
use tracing::{debug, info, warn};

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
