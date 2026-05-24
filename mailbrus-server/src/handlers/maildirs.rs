use super::json_error;
use axum::{
    extract::Path,
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use mailbrus_core::maildir_reader::MaildirReader;
use serde_json::{json, Value};
use tracing::{debug, warn};

pub async fn list_maildirs() -> Response {
    match tokio::task::spawn_blocking(|| {
        MaildirReader::open().and_then(|r| r.list_maildirs())
    })
    .await
    {
        Ok(Ok(paths)) => {
            let maildirs: Vec<Value> = paths
                .iter()
                .map(|p| {
                    let id = p
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("unknown");
                    json!({
                        "id": id,
                        "address": id,
                        "maildir": p.display().to_string(),
                        "unread": 0,
                        "total": 0,
                    })
                })
                .collect();
            let body = json!(maildirs);
            debug!("[api] GET /api/maildirs body: {}", body);
            Json(body).into_response()
        }
        Ok(Err(e)) => {
            warn!("[api] GET /api/maildirs error: {}", e);
            json_error(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string())
        }
        Err(e) => {
            warn!("[api] GET /api/maildirs task error: {}", e);
            json_error(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string())
        }
    }
}

pub async fn list_folders(Path(id): Path<String>) -> Response {
    match tokio::task::spawn_blocking({
        let id = id.clone();
        move || {
            let reader = MaildirReader::open()?;
            let maildirs = reader.list_maildirs()?;
            let maildir = maildirs
                .into_iter()
                .find(|p| p.file_name().and_then(|n| n.to_str()) == Some(id.as_str()));
            match maildir {
                Some(path) => reader.list_folders(&path).map(Some),
                None => Ok(None),
            }
        }
    })
    .await
    {
        Ok(Ok(Some(names))) => {
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
        Ok(Ok(None)) => {
            warn!("[api] GET /api/maildirs/{}/folders not found", &id);
            json_error(StatusCode::NOT_FOUND, "maildir not found")
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
