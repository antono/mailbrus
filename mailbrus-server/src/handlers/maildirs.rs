use super::json_error;
use super::messages::mailbox_prefix;
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

/// Open the mailbrus-owned notmuch reader for this request's database root.
fn open_reader(notmuch_root: Option<PathBuf>) -> Result<MaildirReader, mailbrus_core::MailboxError> {
    match notmuch_root {
        Some(p) => MaildirReader::new(p),
        None => MaildirReader::open(),
    }
}

pub async fn list_maildirs(State(state): State<AppState>) -> Response {
    // Collect the per-account static fields (incl. the maildir root and notmuch
    // query prefix) while we still hold `&state`; the counting runs off-thread.
    struct AccountInfo {
        id: String,
        address: String,
        maildir: String,
        maildir_root: PathBuf,
        prefix: String,
        signature: Option<String>,
    }
    let accounts_snapshot = state.accounts();
    let accounts: Vec<AccountInfo> = accounts_snapshot
        .iter()
        .map(|account| {
            let id = account.id.clone();
            let imap = account.imap();
            let address = imap.map(|i| i.email.clone()).unwrap_or_else(|| id.clone());
            let maildir_root = imap
                .and_then(|i| i.maildir_root.clone())
                .or_else(|| mailbrus_core::config::default_maildir_root(&id))
                .unwrap_or_else(|| PathBuf::from("./mail").join(&id));
            let signature = imap.and_then(|i| i.signature.clone());
            let prefix = mailbox_prefix(&state, &id);
            AccountInfo {
                id,
                address,
                maildir: maildir_root.display().to_string(),
                maildir_root,
                prefix,
                signature,
            }
        })
        .collect();
    let notmuch_root = state.notmuch_db_path.clone();

    let result = tokio::task::spawn_blocking(move || {
        // If the index can't be opened, fall back to zero counts rather than
        // failing the whole maildir list.
        let reader = open_reader(notmuch_root).ok();
        accounts
            .into_iter()
            .map(|acc| {
                // Account totals = sum of the account's per-folder counts. (We
                // count each `folder:` rather than a recursive `path:` query so
                // the numbers match the folder picker exactly.)
                let (unread, total) = match reader.as_ref() {
                    Some(r) => {
                        let mut total = 0usize;
                        let mut unread = 0usize;
                        if let Ok(names) = r.list_folders(&acc.maildir_root) {
                            for name in names {
                                let folder_q = format!("folder:\"{}/{name}\"", acc.prefix);
                                total += r.count(&folder_q).unwrap_or(0);
                                unread += r
                                    .count(&format!("{folder_q} and tag:unread"))
                                    .unwrap_or(0);
                            }
                        }
                        (unread, total)
                    }
                    None => (0, 0),
                };
                json!({
                    "id": acc.id,
                    "address": acc.address,
                    "maildir": acc.maildir,
                    "unread": unread,
                    "total": total,
                    "signature": acc.signature,
                })
            })
            .collect::<Vec<Value>>()
    })
    .await;

    match result {
        Ok(maildirs) => {
            let body = json!(maildirs);
            debug!("[api] GET /api/maildirs body: {}", body);
            Json(body).into_response()
        }
        Err(e) => {
            warn!("[api] GET /api/maildirs task error: {}", e);
            json_error(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string())
        }
    }
}

pub async fn list_folders(State(state): State<AppState>, Path(id): Path<String>) -> Response {
    let account = state.accounts().iter().find(|a| a.id == id).cloned();
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

    // Notmuch `folder:` prefix for this account (e.g. `mail/<id>`), resolved
    // against the database root so the per-folder counts match stored mail.
    let prefix = mailbox_prefix(&state, &id);
    let notmuch_root = state.notmuch_db_path.clone();

    let result = tokio::task::spawn_blocking(move || -> Result<Vec<Value>, mailbrus_core::MailboxError> {
        let reader = open_reader(notmuch_root)?;
        let names = reader.list_folders(&maildir_root)?;
        Ok(names
            .iter()
            .map(|name| {
                let folder_q = format!("folder:\"{prefix}/{name}\"");
                let total = reader.count(&folder_q).unwrap_or(0);
                let unread = reader
                    .count(&format!("{folder_q} and tag:unread"))
                    .unwrap_or(0);
                json!({
                    "id": name,
                    "name": name,
                    "unread": unread,
                    "total": total,
                })
            })
            .collect())
    })
    .await;

    match result {
        Ok(Ok(folders)) => {
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
