use super::json_error;
use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use mailbrus_core::maildir_reader::MaildirReader;
use serde_json::{json, Value};
use std::path::PathBuf;
use tracing::{debug, warn};

use crate::state::AppState;

pub async fn list_maildirs(State(state): State<AppState>) -> Response {
    let maildirs: Vec<Value> = state
        .accounts
        .iter()
        .map(|account| {
            let id = account.id.as_str();
            let imap = account.imap();
            let address = imap
                .map(|i| i.email.as_str())
                .unwrap_or(id);
            let maildir_root = imap
                .and_then(|i| i.maildir_root.clone())
                .or_else(|| mailbrus_core::config::default_maildir_root(id))
                .map(|p| p.display().to_string())
                .unwrap_or_default();
            json!({
                "id": id,
                "address": address,
                "maildir": maildir_root,
                "unread": 0,
                "total": 0,
            })
        })
        .collect();
    let body = json!(maildirs);
    debug!("[api] GET /api/maildirs body: {}", body);
    Json(body).into_response()
}

pub async fn list_folders(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Response {
    let account = state.accounts.iter().find(|a| a.id == id).cloned();
    let account = match account {
        Some(a) => a,
        None => {
            warn!("[api] GET /api/maildirs/{}/folders not found in config", &id);
            return json_error(StatusCode::NOT_FOUND, "maildir not found");
        }
    };

    let maildir_root: PathBuf = account
        .imap()
        .and_then(|i| i.maildir_root.clone())
        .or_else(|| mailbrus_core::config::default_maildir_root(&id))
        .unwrap_or_else(|| PathBuf::from("./mail").join(&id));

    let notmuch_root = state.notmuch_db_path.clone();

    let result = tokio::task::spawn_blocking(move || {
        let reader = match notmuch_root {
            Some(p) => MaildirReader::new(p)?,
            None => MaildirReader::open()?,
        };
        reader.list_folders(&maildir_root)
    })
    .await;

    match result {
        Ok(Ok(names)) => {
            let folders: Vec<Value> = names
                .iter()
                .map(|name| {
                    json!({
                        "id": name,
                        "name": name,
                        "unread": 0,
                        "total": 0,
                    })
                })
                .collect();
            let body = json!(folders);
            debug!("[api] GET /api/maildirs/{}/folders body: {}", &id, body);
            Json(body).into_response()
        }
        Ok(Err(e)) => {
            warn!("[api] GET /api/maildirs/{}/folders error: {}", &id, e);
            json_error(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string())
        }
        Err(e) => {
            warn!("[api] GET /api/maildirs/{}/folders task error: {}", &id, e);
            json_error(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string())
        }
    }
}
