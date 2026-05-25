use super::json_error;
use crate::mime::{build_body_response, extract_message, message_to_json};
use axum::{
    extract::{Path, Query},
    http::{StatusCode, header},
    response::{IntoResponse, Response},
    Json,
};
use mail_parser::{MessageParser, MimeHeaders, PartType};
use mailbrus_core::{
    maildir_reader::{MaildirReader, PaginationOpts, SortBy},
    MailboxError,
};
use serde::Deserialize;
use serde_json::json;
use tracing::{debug, info, warn};

#[derive(Deserialize)]
pub struct Pagination {
    page: Option<u64>,
    per_page: Option<u64>,
}

impl Pagination {
    fn to_opts(&self) -> (PaginationOpts, u64, u64) {
        let page = self.page.unwrap_or(1).max(1);
        let per_page = self.per_page.unwrap_or(25).max(1);
        (
            PaginationOpts {
                limit: per_page as usize,
                offset: ((page - 1) * per_page) as usize,
            },
            page,
            per_page,
        )
    }
}

pub async fn list_messages(
    Path((maildir_id, folder_id)): Path<(String, String)>,
    Query(pagination): Query<Pagination>,
) -> Response {
    let (opts, page, per_page) = pagination.to_opts();
    let query = format!("folder:\"{maildir_id}/{folder_id}\"");
    match tokio::task::spawn_blocking(move || {
        MaildirReader::open().and_then(|r| r.list_messages(&query, SortBy::Newest, opts))
    })
    .await
    {
        Ok(Ok((messages, total))) => {
            let total_pages = (total as u64 + per_page - 1) / per_page;
            let body = json!({
                "messages": messages.iter().map(message_to_json).collect::<Vec<_>>(),
                "count": total,
                "page": page,
                "per_page": per_page,
            });
            debug!(
                "[api] GET /api/maildirs/{}/folders/{}/messages body: page {}/{} count={} messages={}",
                maildir_id, folder_id, page, total_pages, total, body["messages"]
            );
            Json(body).into_response()
        }
        Ok(Err(e)) => {
            warn!("[api] error listing messages: {}", e);
            json_error(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string())
        }
        Err(e) => {
            warn!("[api] task error: {}", e);
            json_error(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string())
        }
    }
}

#[derive(Deserialize)]
pub struct SearchParams {
    q: Option<String>,
    page: Option<u64>,
    per_page: Option<u64>,
}

pub async fn search_messages(Query(params): Query<SearchParams>) -> Response {
    let q = match params.q.filter(|s| !s.is_empty()) {
        Some(q) => q,
        None => {
            warn!("[api] GET /api/messages/search missing required parameter: q");
            return json_error(StatusCode::BAD_REQUEST, "missing required parameter: q");
        }
    };
    let page = params.page.unwrap_or(1).max(1);
    let per_page = params.per_page.unwrap_or(25).max(1);
    let opts = PaginationOpts {
        limit: per_page as usize,
        offset: ((page - 1) * per_page) as usize,
    };
    match tokio::task::spawn_blocking(move || {
        MaildirReader::open().and_then(|r| r.list_messages(&q, SortBy::Newest, opts))
    })
    .await
    {
        Ok(Ok((messages, total))) => {
            let body = json!({
                "messages": messages.iter().map(message_to_json).collect::<Vec<_>>(),
                "count": total,
                "page": page,
                "per_page": per_page,
            });
            debug!(
                "[api] GET /api/messages/search body: count={} messages={}",
                total, body["messages"]
            );
            Json(body).into_response()
        }
        Ok(Err(e)) => {
            warn!("[api] error searching messages: {}", e);
            json_error(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string())
        }
        Err(e) => {
            warn!("[api] task error: {}", e);
            json_error(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string())
        }
    }
}

#[derive(Deserialize)]
pub struct GetMessageQuery {
    pub mode: Option<String>,
}

pub async fn get_message(
    Path(id): Path<String>,
    Query(query): Query<GetMessageQuery>,
) -> Response {
    let mode = query.mode.unwrap_or_else(|| "auto".to_string());
    match tokio::task::spawn_blocking(move || {
        let reader = MaildirReader::open()?;
        let raw = reader.get_message_body(&id)?;
        Ok::<_, MailboxError>((id, raw))
    })
    .await
    {
        Ok(Ok((id, raw))) => {
            let body = match extract_message(&raw) {
                Some(parsed) => {
                    let resolved_mode = match mode.as_str() {
                        "text" if !parsed.has_plain => {
                            if parsed.has_html { "simple" } else { "text" }
                        }
                        "html" | "simple" | "text" => mode.as_str(),
                        _ => {
                            if parsed.has_plain {
                                "text"
                            } else {
                                "simple"
                            }
                        }
                    };
                    let hdr = |key: &str| {
                        parsed
                            .headers
                            .get(key)
                            .and_then(|v| v.as_array())
                            .and_then(|a| a.first())
                            .and_then(|v| v.as_str())
                            .unwrap_or("-")
                            .to_string()
                    };
                    debug!(
                        "[api] GET /api/messages/{} mode={}\n  from: {}\n  to: {}\n  subject: {}\n  date: {}\n  has_plain: {} has_html: {}",
                        id, resolved_mode,
                        hdr("From"), hdr("To"), hdr("Subject"), hdr("Date"),
                        parsed.has_plain, parsed.has_html,
                    );
                    build_body_response(&id, parsed, resolved_mode)
                }
                None => json!({"id": id, "headers": {}, "body": "", "attachments": [], "mode": "text", "has_plain": false, "has_html": false, "has_remote": 0, "format_flowed": false}),
            };
            Json(body).into_response()
        }
        Ok(Err(MailboxError::MessageNotFound { id })) => {
            warn!("[api] GET /api/messages/{} not found", id);
            json_error(StatusCode::NOT_FOUND, &format!("message not found: {id}"))
        }
        Ok(Err(e)) => {
            warn!("[api] GET /api/messages error: {}", e);
            json_error(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string())
        }
        Err(e) => {
            warn!("[api] task error: {}", e);
            json_error(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string())
        }
    }
}

pub async fn get_cid(Path((id, cid)): Path<(String, String)>) -> Response {
    debug!("[render] GET /api/messages/{}/cid/{}", id, cid);
    match tokio::task::spawn_blocking(move || {
        let reader = MaildirReader::open()?;
        let raw = reader.get_message_body(&id)?;
        Ok::<_, MailboxError>((id, raw))
    })
    .await
    {
        Ok(Ok((_id, raw))) => {
            let msg = match MessageParser::new().parse(&raw) {
                Some(m) => m,
                None => return json_error(StatusCode::NOT_FOUND, "cid not found"),
            };
            for part in &msg.parts {
                let part_cid = part
                    .content_id()
                    .map(|c| c.trim_matches(['<', '>']).to_string());
                if part_cid.as_deref() == Some(cid.as_str()) {
                    let mime = part
                        .content_type()
                        .map(|ct| {
                            format!(
                                "{}/{}",
                                ct.c_type,
                                ct.c_subtype.as_deref().unwrap_or("octet-stream")
                            )
                        })
                        .unwrap_or_else(|| "application/octet-stream".to_string());
                    let bytes: Vec<u8> = match &part.body {
                        PartType::Binary(b) | PartType::InlineBinary(b) => b.as_ref().to_vec(),
                        PartType::Text(t) => t.as_bytes().to_vec(),
                        _ => continue,
                    };
                    return (
                        StatusCode::OK,
                        [(header::CONTENT_TYPE, mime)],
                        bytes,
                    )
                        .into_response();
                }
            }
            json_error(StatusCode::NOT_FOUND, "cid not found")
        }
        Ok(Err(MailboxError::MessageNotFound { id })) => {
            warn!("[render] cid lookup: message {} not found", id);
            json_error(StatusCode::NOT_FOUND, "message not found")
        }
        Ok(Err(e)) => json_error(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()),
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()),
    }
}

/// Extract (mime, name, bytes) for the MIME part at `part_index`.
fn extract_part(raw: &[u8], part_index: usize) -> Option<(String, String, Vec<u8>)> {
    let msg = MessageParser::new().parse(raw)?;
    let part = msg.parts.get(part_index)?;
    let mime = part
        .content_type()
        .map(|ct| format!("{}/{}", ct.c_type, ct.c_subtype.as_deref().unwrap_or("octet-stream")))
        .unwrap_or_else(|| "application/octet-stream".to_string());
    let name = part
        .content_disposition()
        .and_then(|cd| cd.attribute("filename"))
        .or_else(|| part.content_type().and_then(|ct| ct.attribute("name")))
        .unwrap_or("attachment")
        .to_string();
    let bytes: Vec<u8> = match &part.body {
        PartType::Binary(b) | PartType::InlineBinary(b) => b.as_ref().to_vec(),
        PartType::Html(h) => h.as_bytes().to_vec(),
        PartType::Text(t) => t.as_bytes().to_vec(),
        _ => return None,
    };
    Some((mime, name, bytes))
}

pub async fn get_attachment(Path((id, part_index)): Path<(String, usize)>) -> Response {
    match tokio::task::spawn_blocking(move || {
        let reader = MaildirReader::open()?;
        let raw = reader.get_message_body(&id)?;
        Ok::<_, MailboxError>(raw)
    })
    .await
    {
        Ok(Ok(raw)) => match extract_part(&raw, part_index) {
            Some((mime, name, bytes)) => {
                let safe_name: String = name
                    .chars()
                    .map(|c| if c.is_alphanumeric() || matches!(c, '.' | '-' | '_') { c } else { '_' })
                    .collect();
                let disposition = format!("attachment; filename=\"{safe_name}\"");
                (
                    StatusCode::OK,
                    [
                        (header::CONTENT_TYPE, mime),
                        (header::CONTENT_DISPOSITION, disposition),
                    ],
                    bytes,
                )
                    .into_response()
            }
            None => json_error(StatusCode::NOT_FOUND, "part not found"),
        },
        Ok(Err(MailboxError::MessageNotFound { id })) => {
            json_error(StatusCode::NOT_FOUND, &format!("message not found: {id}"))
        }
        Ok(Err(e)) => json_error(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()),
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()),
    }
}

pub async fn open_attachment(Path((id, part_index)): Path<(String, usize)>) -> Response {
    match tokio::task::spawn_blocking(move || {
        let reader = MaildirReader::open()?;
        let raw = reader.get_message_body(&id)?;
        Ok::<_, MailboxError>((id, raw))
    })
    .await
    {
        Ok(Ok((id, raw))) => match extract_part(&raw, part_index) {
            Some((_mime, name, bytes)) => {
                let safe_id: String = id
                    .chars()
                    .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
                    .collect();
                let safe_name: String = name
                    .chars()
                    .map(|c| if c.is_alphanumeric() || matches!(c, '.' | '-' | '_') { c } else { '_' })
                    .collect();
                let tmp_dir = std::env::temp_dir();
                let path = tmp_dir.join(format!("{safe_id}_{safe_name}"));
                if let Err(e) = std::fs::write(&path, &bytes) {
                    warn!("[attach] failed to write tmp file {:?}: {}", path, e);
                    return json_error(StatusCode::INTERNAL_SERVER_ERROR, "cannot write tmp file");
                }
                info!("[attach] saved {} → {:?}", id, path);
                match open::that_detached(&path) {
                    Ok(()) => Json(json!({"ok": true, "path": path.to_string_lossy()})).into_response(),
                    Err(e) => {
                        warn!("[attach] could not open {:?}: {}", path, e);
                        json_error(StatusCode::INTERNAL_SERVER_ERROR, "cannot open attachment")
                    }
                }
            }
            None => json_error(StatusCode::NOT_FOUND, "part not found"),
        },
        Ok(Err(MailboxError::MessageNotFound { id })) => {
            json_error(StatusCode::NOT_FOUND, &format!("message not found: {id}"))
        }
        Ok(Err(e)) => json_error(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()),
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()),
    }
}

#[derive(Deserialize)]
pub struct MessagePatch {
    pub op: String,
    #[allow(dead_code)]
    pub target_folder: Option<String>,
}

pub async fn patch_message(Path(id): Path<String>, Json(body): Json<MessagePatch>) -> Response {
    debug!("[api] PATCH /api/messages/{} op={}", id, body.op);
    Json(json!({"ok": true})).into_response()
}

pub async fn delete_message(Path(id): Path<String>) -> Response {
    debug!("[api] DELETE /api/messages/{}", id);
    Json(json!({"ok": true})).into_response()
}
