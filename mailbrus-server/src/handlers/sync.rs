use super::json_error;
use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{
        sse::{Event, KeepAlive, Sse},
        IntoResponse, Response,
    },
    Json,
};
use futures::stream::Stream;
use mailbrus_core::sync::SyncError;
use serde_json::json;
use std::convert::Infallible;
use std::future::Future;
use std::pin::Pin;
use std::task::{Context, Poll};
use tokio::sync::broadcast;
use tracing::{debug, warn};

use crate::state::AppState;

pub async fn sync_all(State(state): State<AppState>) -> Response {
    match &state.sync_engine {
        Some(engine) => {
            engine.sync_all();
            (StatusCode::ACCEPTED, Json(json!({ "job": "all" }))).into_response()
        }
        None => {
            warn!("[api] POST /api/sync called but no sync engine configured");
            json_error(StatusCode::SERVICE_UNAVAILABLE, "no sync engine configured")
        }
    }
}

pub async fn sync_account(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Response {
    let engine = match &state.sync_engine {
        Some(e) => e.clone(),
        None => {
            return json_error(StatusCode::SERVICE_UNAVAILABLE, "no sync engine configured");
        }
    };
    match engine.sync_account(&id).await {
        Ok(()) => {
            debug!("[api] POST /api/sync/{} accepted", id);
            (StatusCode::ACCEPTED, Json(json!({ "job": id }))).into_response()
        }
        Err(SyncError::UnknownAccount(_)) => {
            warn!("[api] POST /api/sync/{} unknown account", id);
            json_error(StatusCode::NOT_FOUND, "unknown account")
        }
        Err(SyncError::AlreadyRunning(_)) => {
            warn!("[api] POST /api/sync/{} already running", id);
            (
                StatusCode::CONFLICT,
                Json(json!({ "error": "sync already running" })),
            )
                .into_response()
        }
    }
}

pub async fn sync_stream(
    State(state): State<AppState>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let rx = match &state.sync_engine {
        Some(e) => e.subscribe(),
        None => {
            // Return an empty stream that keeps the connection alive but emits nothing.
            let (tx, rx) = broadcast::channel(1);
            drop(tx);
            rx
        }
    };
    let stream = BroadcastSseStream { rx };
    Sse::new(stream).keep_alive(KeepAlive::default())
}

struct BroadcastSseStream {
    rx: broadcast::Receiver<mailbrus_core::sync::SyncEvent>,
}

impl Stream for BroadcastSseStream {
    type Item = Result<Event, Infallible>;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        let fut = self.rx.recv();
        tokio::pin!(fut);
        match fut.poll(cx) {
            Poll::Ready(Ok(evt)) => match Event::default().json_data(&evt) {
                Ok(e) => Poll::Ready(Some(Ok(e))),
                Err(_) => Poll::Pending,
            },
            Poll::Ready(Err(broadcast::error::RecvError::Closed)) => Poll::Ready(None),
            Poll::Ready(Err(broadcast::error::RecvError::Lagged(_))) => Poll::Pending,
            Poll::Pending => Poll::Pending,
        }
    }
}
