use crate::state::{AppState, PushSubscription};
use axum::{
    extract::State,
    response::{IntoResponse, Response},
    Json,
};
use serde::Deserialize;
use serde_json::json;
use tracing::debug;
use uuid::Uuid;

#[derive(Deserialize)]
pub struct PushSubscribeBody {
    pub account: String,
    pub endpoint: String,
    pub keys: serde_json::Value,
}

pub async fn push_subscribe(
    State(state): State<AppState>,
    Json(body): Json<PushSubscribeBody>,
) -> Response {
    debug!("[api] POST /api/push/subscribe account={}", body.account);
    let id = Uuid::new_v4().to_string();
    let sub = PushSubscription {
        id: id.clone(),
        account: body.account.clone(),
        endpoint: body.endpoint,
        keys: body.keys,
    };
    state.push_subscriptions.lock().unwrap().insert(id, sub);
    debug!("[api] subscription created for account {}", body.account);
    Json(json!({"ok": true})).into_response()
}

pub async fn push_unsubscribe(
    State(state): State<AppState>,
    Json(body): Json<serde_json::Value>,
) -> Response {
    let account = body.get("account").and_then(|v| v.as_str()).unwrap_or("");
    debug!("[api] DELETE /api/push/subscribe account={}", account);
    let mut subs = state.push_subscriptions.lock().unwrap();
    subs.retain(|_, v| v.account != account);
    debug!("[api] unsubscribed account {}", account);
    Json(json!({"ok": true})).into_response()
}

pub async fn push_vapid_key(State(state): State<AppState>) -> Response {
    debug!("[api] GET /api/push/vapid-key");
    Json(json!({"publicKey": *state.vapid_public_key})).into_response()
}

pub async fn send_message(Json(body): Json<serde_json::Value>) -> Response {
    let msg_id = body.get("id").and_then(|v| v.as_str()).unwrap_or("-");
    debug!("[api] POST /api/send msg_id={}", msg_id);
    Json(json!({"ok": true})).into_response()
}
