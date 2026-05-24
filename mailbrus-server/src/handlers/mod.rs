pub mod maildirs;
pub mod messages;
pub mod push;

use axum::{http::StatusCode, response::{IntoResponse, Response}, Json};
use serde_json::json;

pub fn json_error(status: StatusCode, msg: &str) -> Response {
    (status, Json(json!({"error": msg}))).into_response()
}
