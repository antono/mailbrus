use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{delete, get, patch, post},
    Json, Router,
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use clap::Parser;
use mail_parser::{MessageParser, MimeHeaders, PartType};
use mailbrus_core::{
    maildir_reader::{MaildirReader, Message, PaginationOpts, SortBy},
    MailboxError,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::{
    collections::HashMap,
    net::SocketAddr,
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tower_http::services::{ServeDir, ServeFile};
use tracing::{debug, info};

// ── App state ─────────────────────────────────────────────────────────────────

#[derive(Clone)]
struct AppState {
    push_subscriptions: Arc<Mutex<HashMap<String, PushSubscription>>>,
    vapid_public_key: Arc<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PushSubscription {
    id: String,
    account: String,
    endpoint: String,
    keys: serde_json::Value,
}

impl AppState {
    fn new() -> Self {
        // task 10.1: generate VAPID key pair (placeholder — real impl needs p256 crate)
        let vapid_public_key = std::env::var("VAPID_PUBLIC_KEY").unwrap_or_else(|_| {
            let raw: Vec<u8> = (0..65).map(|i| i as u8).collect(); // deterministic placeholder
            URL_SAFE_NO_PAD.encode(&raw)
        });
        info!("[pwa] VAPID public key ready");
        Self {
            push_subscriptions: Arc::new(Mutex::new(HashMap::new())),
            vapid_public_key: Arc::new(vapid_public_key),
        }
    }
}

#[derive(Parser)]
#[command(name = "mailbrus-server", version)]
struct Cli {
    #[arg(long, default_value = "127.0.0.1:1371")]
    bind: String,
    #[arg(long, default_value = "./build")]
    frontend_dist: PathBuf,
    #[arg(long)]
    auth: Option<String>,
}

fn json_error(status: StatusCode, msg: &str) -> Response {
    (status, Json(json!({"error": msg}))).into_response()
}

fn message_to_json(m: &Message) -> Value {
    let from = m.headers.from.as_deref().unwrap_or("");
    let addr = if let (Some(s), Some(e)) = (from.find('<'), from.rfind('>')) {
        from[s + 1..e].to_string()
    } else {
        from.to_string()
    };
    let time = m.headers.date.map(|d| d.to_string()).unwrap_or_default();
    json!({
        "id": m.id,
        "from": from,
        "addr": addr,
        "subject": m.headers.subject.as_deref().unwrap_or("(no subject)"),
        "preview": "",
        "time": time,
        "unread": !m.flags.seen,
        "flags": "",
    })
}

fn parse_message_body(id: &str, raw: &[u8]) -> Value {
    let msg = match MessageParser::new().parse(raw) {
        Some(m) => m,
        None => return json!({"id": id, "headers": {}, "body": "", "attachments": []}),
    };

    let raw_bytes = msg.raw_message.as_ref();
    let mut headers: Map<String, Value> = Map::new();
    if let Some(root) = msg.parts.first() {
        for h in &root.headers {
            let name = h.name().to_string();
            let value = std::str::from_utf8(
                &raw_bytes[h.offset_start as usize..h.offset_end as usize],
            )
            .unwrap_or("")
            .trim()
            .to_string();
            headers
                .entry(name)
                .or_insert_with(|| Value::Array(vec![]))
                .as_array_mut()
                .unwrap()
                .push(Value::String(value));
        }
    }

    let mut body = String::new();
    for &pid in &msg.text_body {
        if let Some(part) = msg.parts.get(pid as usize) {
            if let PartType::Text(text) = &part.body {
                body = text.as_ref().to_string();
                break;
            }
        }
    }

    let mut attachments: Vec<Value> = Vec::new();
    for &pid in &msg.attachments {
        if let Some(part) = msg.parts.get(pid as usize) {
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
            let name = part
                .content_disposition()
                .and_then(|cd| cd.attribute("filename"))
                .or_else(|| part.content_type().and_then(|ct| ct.attribute("name")))
                .unwrap_or("unnamed");
            attachments.push(json!({"name": name, "size": 0, "mime": mime}));
        }
    }

    json!({"id": id, "headers": headers, "body": body, "attachments": attachments})
}

// ── Handlers ──────────────────────────────────────────────────────────────────

async fn list_maildirs() -> Response {
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
            Json(json!(maildirs)).into_response()
        }
        Ok(Err(e)) => json_error(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()),
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()),
    }
}

async fn list_folders(Path(id): Path<String>) -> Response {
    match tokio::task::spawn_blocking(move || {
        let reader = MaildirReader::open()?;
        let maildirs = reader.list_maildirs()?;
        let maildir = maildirs
            .into_iter()
            .find(|p| p.file_name().and_then(|n| n.to_str()) == Some(id.as_str()));
        match maildir {
            Some(path) => reader.list_folders(&path).map(Some),
            None => Ok(None),
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
            Json(json!(folders)).into_response()
        }
        Ok(Ok(None)) => json_error(StatusCode::NOT_FOUND, "maildir not found"),
        Ok(Err(e)) => json_error(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()),
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()),
    }
}

#[derive(Deserialize)]
struct Pagination {
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

async fn list_messages(
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
        Ok(Ok((messages, total))) => Json(json!({
            "messages": messages.iter().map(message_to_json).collect::<Vec<_>>(),
            "total": total,
            "page": page,
            "per_page": per_page,
        }))
        .into_response(),
        Ok(Err(e)) => json_error(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()),
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()),
    }
}

#[derive(Deserialize)]
struct SearchParams {
    q: Option<String>,
    page: Option<u64>,
    per_page: Option<u64>,
}

async fn search_messages(Query(params): Query<SearchParams>) -> Response {
    let q = match params.q.filter(|s| !s.is_empty()) {
        Some(q) => q,
        None => return json_error(StatusCode::BAD_REQUEST, "missing required parameter: q"),
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
        Ok(Ok((messages, total))) => Json(json!({
            "messages": messages.iter().map(message_to_json).collect::<Vec<_>>(),
            "total": total,
            "page": page,
            "per_page": per_page,
        }))
        .into_response(),
        Ok(Err(e)) => json_error(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()),
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()),
    }
}

async fn get_message(Path(id): Path<String>) -> Response {
    match tokio::task::spawn_blocking(move || {
        let reader = MaildirReader::open()?;
        let raw = reader.get_message_body(&id)?;
        Ok::<_, MailboxError>((id, raw))
    })
    .await
    {
        Ok(Ok((id, raw))) => Json(parse_message_body(&id, &raw)).into_response(),
        Ok(Err(MailboxError::MessageNotFound { id })) => {
            json_error(StatusCode::NOT_FOUND, &format!("message not found: {id}"))
        }
        Ok(Err(e)) => json_error(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()),
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()),
    }
}

// ── PATCH / DELETE message handlers (tasks 8.10, 3.5) ────────────────────────

#[derive(Deserialize)]
struct MessagePatch {
    op: String,
    target_folder: Option<String>,
}

async fn patch_message(Path(id): Path<String>, Json(body): Json<MessagePatch>) -> Response {
    debug!("[pwa] PATCH /api/messages/{} op={}", id, body.op);
    // Actual IMAP mutation would go here; return 200 OK for now
    Json(json!({"ok": true})).into_response()
}

async fn delete_message(Path(id): Path<String>) -> Response {
    debug!("[pwa] DELETE /api/messages/{}", id);
    // Actual IMAP deletion would go here; return 200 OK for now
    Json(json!({"ok": true})).into_response()
}

// ── Push endpoints (tasks 10.2, 10.3, 10.5) ──────────────────────────────────

#[derive(Deserialize)]
struct PushSubscribeBody {
    account: String,
    endpoint: String,
    keys: serde_json::Value,
}

async fn push_subscribe(
    State(state): State<AppState>,
    Json(body): Json<PushSubscribeBody>,
) -> Response {
    debug!("[pwa] push/subscribe account={}", body.account);
    let id = uuid::Uuid::new_v4().to_string();
    let sub = PushSubscription {
        id: id.clone(),
        account: body.account.clone(),
        endpoint: body.endpoint,
        keys: body.keys,
    };
    state.push_subscriptions.lock().unwrap().insert(id, sub);
    Json(json!({"ok": true})).into_response()
}

async fn push_unsubscribe(
    State(state): State<AppState>,
    Json(body): Json<serde_json::Value>,
) -> Response {
    let account = body.get("account").and_then(|v| v.as_str()).unwrap_or("");
    debug!("[pwa] push/unsubscribe account={}", account);
    let mut subs = state.push_subscriptions.lock().unwrap();
    subs.retain(|_, v| v.account != account);
    Json(json!({"ok": true})).into_response()
}

async fn push_vapid_key(State(state): State<AppState>) -> Response {
    debug!("[pwa] GET /api/push/vapid-key");
    Json(json!({"publicKey": *state.vapid_public_key})).into_response()
}

// ── Send endpoint (task 3.5) ──────────────────────────────────────────────────

async fn send_message(Json(body): Json<serde_json::Value>) -> Response {
    debug!("[pwa] POST /api/send msg_id={}", body.get("id").and_then(|v| v.as_str()).unwrap_or("-"));
    // Actual SMTP send would go here
    Json(json!({"ok": true})).into_response()
}

// ── Push polling task (task 10.4) ─────────────────────────────────────────────

/// Polls for new messages every 60s and sends Web Push to subscribed accounts.
/// Actual Web Push delivery requires the `web-push` crate with VAPID signing.
/// This skeleton tracks last-seen message count per account and logs what it would push.
fn spawn_push_poller(state: AppState) {
    tokio::spawn(async move {
        let mut seen: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(60)).await;

            let subs: Vec<PushSubscription> = state
                .push_subscriptions
                .lock()
                .unwrap()
                .values()
                .cloned()
                .collect();

            if subs.is_empty() {
                continue;
            }

            let result = tokio::task::spawn_blocking(|| {
                let reader = MaildirReader::open()?;
                let maildirs = reader.list_maildirs()?;
                Ok::<_, MailboxError>(maildirs)
            })
            .await;

            let maildirs = match result {
                Ok(Ok(m)) => m,
                _ => continue,
            };

            for maildir in maildirs {
                let id = maildir
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("")
                    .to_string();
                let opts = PaginationOpts { limit: 1, offset: 0 };
                let query = format!("folder:\"{id}/INBOX\"");
                let total = {
                    let q2 = query.clone();
                    tokio::task::spawn_blocking(move || {
                        MaildirReader::open()
                            .and_then(|r| r.list_messages(&q2, SortBy::Newest, opts))
                            .map(|(_, t)| t)
                    })
                    .await
                    .ok()
                    .and_then(|r| r.ok())
                    .unwrap_or(0)
                };

                let prev = *seen.get(&id).unwrap_or(&total);
                if total > prev {
                    let new_count = total - prev;
                    debug!("[pwa] push/notify account={} new_messages={}", id, new_count);
                    // Deliver push to all subscriptions for this account
                    let account_subs: Vec<_> = subs.iter().filter(|s| s.account == id || s.account.is_empty()).collect();
                    for sub in account_subs {
                        // TODO: use `web-push` crate with VAPID to send to sub.endpoint
                        // Payload: { subject, sender, thread_url }
                        debug!("[pwa] push/send endpoint={}", &sub.endpoint[..sub.endpoint.len().min(40)]);
                    }
                }
                seen.insert(id, total);
            }
        }
    });
}

// ── Main ──────────────────────────────────────────────────────────────────────

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let cli = Cli::parse();
    let state = AppState::new();
    spawn_push_poller(state.clone());

    let bind_addr: SocketAddr = cli.bind.parse().unwrap_or_else(|e| {
        eprintln!("error: invalid bind address: {e}");
        std::process::exit(1);
    });

    if !bind_addr.ip().is_loopback() && cli.auth.is_none() {
        eprintln!("WARNING: server is publicly accessible without authentication");
    }

    if !cli.frontend_dist.exists() {
        eprintln!(
            "WARNING: frontend dist {:?} does not exist; GET / will return 404",
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
        .route("/send", post(send_message))
        .route("/push/vapid-key", get(push_vapid_key))
        .route("/push/subscribe", post(push_subscribe))
        .route("/push/subscribe", delete(push_unsubscribe))
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

    info!("Listening on http://{bind_addr}");
    axum::serve(listener, app).await.expect("server error");
}
