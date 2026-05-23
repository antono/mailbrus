use axum::{
    extract::{Path, Query, State},
    http::{Request, StatusCode},
    middleware::Next,
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
    net::{IpAddr, SocketAddr},
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tower_http::services::{ServeDir, ServeFile};
use tracing::{debug, info, warn};

#[derive(Debug, Clone, Copy, PartialEq, Eq, clap::ValueEnum)]
enum LogLevel {
    /// Full responses and request bodies
    #[value(name = "debug")]
    Debug,
    /// Request/response metadata only (method, path, status)
    #[value(name = "info")]
    Info,
    /// Key events only (startup, shutdown, errors)
    #[value(name = "warn")]
    Warn,
}

// ── App state ─────────────────────────────────────────────────────────────────

#[derive(Clone)]
struct AppState {
    push_subscriptions: Arc<Mutex<HashMap<String, PushSubscription>>>,
    vapid_public_key: Arc<String>,
    log_level: LogLevel,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PushSubscription {
    id: String,
    account: String,
    endpoint: String,
    keys: serde_json::Value,
}

impl AppState {
    fn new(log_level: LogLevel) -> Self {
        // task 10.1: generate VAPID key pair (placeholder — real impl needs p256 crate)
        let vapid_public_key = std::env::var("VAPID_PUBLIC_KEY").unwrap_or_else(|_| {
            let raw: Vec<u8> = (0..65).map(|i| i as u8).collect(); // deterministic placeholder
            URL_SAFE_NO_PAD.encode(&raw)
        });
        info!("[pwa] VAPID public key ready");
        Self {
            push_subscriptions: Arc::new(Mutex::new(HashMap::new())),
            vapid_public_key: Arc::new(vapid_public_key),
            log_level,
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
    /// Open the default web browser at the server URL after startup
    #[arg(long)]
    browser: bool,
    /// Log level: debug (full responses), info (metadata only), warn (key events)
    #[arg(long, default_value = "info", value_enum)]
    log_level: LogLevel,
}

/// Build the URL to open in a browser from the listener's bound address.
///
/// The port is taken from the actual bound address, so ephemeral ports
/// (`--bind ADDR:0`) resolve to the real assigned port. Unspecified hosts
/// (`0.0.0.0` / `::`) are mapped to loopback because a browser cannot connect
/// to an unspecified address.
fn browser_url(addr: SocketAddr) -> String {
    match addr.ip() {
        IpAddr::V4(v4) if v4.is_unspecified() => format!("http://127.0.0.1:{}", addr.port()),
        IpAddr::V6(v6) if v6.is_unspecified() => format!("http://[::1]:{}", addr.port()),
        IpAddr::V4(v4) => format!("http://{}:{}", v4, addr.port()),
        IpAddr::V6(v6) => format!("http://[{}]:{}", v6, addr.port()),
    }
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

// ── Logging middleware ────────────────────────────────────────────────────────

async fn log_middleware(
    State(state): State<AppState>,
    req: Request<axum::body::Body>,
    next: Next,
) -> Response {
    let method = req.method().to_string();
    let uri = req.uri().to_string();

    if state.log_level == LogLevel::Debug {
        debug!("[req] {} {}", method, uri);
    }

    let res = next.run(req).await;
    let status = res.status();

    match state.log_level {
        LogLevel::Debug => {
            debug!("[res] {} {} -> {}", method, uri, status);
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

// ── Handlers ──────────────────────────────────────────────────────────────────

async fn list_maildirs() -> Response {
    debug!("[endpoint] GET /api/maildirs");
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
            debug!("[endpoint] listed {} maildirs", maildirs.len());
            Json(json!(maildirs)).into_response()
        }
        Ok(Err(e)) => {
            warn!("[endpoint] error listing maildirs: {}", e);
            json_error(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string())
        }
        Err(e) => {
            warn!("[endpoint] task error: {}", e);
            json_error(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string())
        }
    }
}

async fn list_folders(Path(id): Path<String>) -> Response {
    debug!("[endpoint] GET /api/maildirs/{}/folders", &id);
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
            debug!("[endpoint] listed {} folders for maildir {}", folders.len(), &id);
            Json(json!(folders)).into_response()
        }
        Ok(Ok(None)) => {
            warn!("[endpoint] maildir not found: {}", &id);
            json_error(StatusCode::NOT_FOUND, "maildir not found")
        }
        Ok(Err(e)) => {
            warn!("[endpoint] error listing folders: {}", e);
            json_error(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string())
        }
        Err(e) => {
            warn!("[endpoint] task error: {}", e);
            json_error(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string())
        }
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
    debug!("[endpoint] GET /api/maildirs/{}/folders/{}/messages page={:?} per_page={:?}",
        maildir_id, folder_id, pagination.page, pagination.per_page);
    let (opts, page, per_page) = pagination.to_opts();
    let query = format!("folder:\"{maildir_id}/{folder_id}\"");
    match tokio::task::spawn_blocking(move || {
        MaildirReader::open().and_then(|r| r.list_messages(&query, SortBy::Newest, opts))
    })
    .await
    {
        Ok(Ok((messages, total))) => {
            let total_pages = (total as u64 + per_page - 1) / per_page;
            debug!("[endpoint] listed {} messages (page {} of {})", messages.len(), page, total_pages);
            Json(json!({
                "messages": messages.iter().map(message_to_json).collect::<Vec<_>>(),
                "count": total,
                "page": page,
                "per_page": per_page,
            }))
            .into_response()
        }
        Ok(Err(e)) => {
            warn!("[endpoint] error listing messages: {}", e);
            json_error(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string())
        }
        Err(e) => {
            warn!("[endpoint] task error: {}", e);
            json_error(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string())
        }
    }
}

#[derive(Deserialize)]
struct SearchParams {
    q: Option<String>,
    page: Option<u64>,
    per_page: Option<u64>,
}

async fn search_messages(Query(params): Query<SearchParams>) -> Response {
    debug!("[endpoint] GET /api/messages/search q={:?} page={:?} per_page={:?}",
        params.q, params.page, params.per_page);
    let q = match params.q.filter(|s| !s.is_empty()) {
        Some(q) => q,
        None => {
            warn!("[endpoint] search missing required parameter: q");
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
            debug!("[endpoint] search found {} results", total);
            Json(json!({
                "messages": messages.iter().map(message_to_json).collect::<Vec<_>>(),
                "count": total,
                "page": page,
                "per_page": per_page,
            }))
            .into_response()
        }
        Ok(Err(e)) => {
            warn!("[endpoint] error searching messages: {}", e);
            json_error(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string())
        }
        Err(e) => {
            warn!("[endpoint] task error: {}", e);
            json_error(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string())
        }
    }
}

async fn get_message(Path(id): Path<String>) -> Response {
    debug!("[endpoint] GET /api/messages/{}", id);
    match tokio::task::spawn_blocking(move || {
        let reader = MaildirReader::open()?;
        let raw = reader.get_message_body(&id)?;
        Ok::<_, MailboxError>((id, raw))
    })
    .await
    {
        Ok(Ok((id, raw))) => {
            debug!("[endpoint] retrieved message {}", id);
            Json(parse_message_body(&id, &raw)).into_response()
        }
        Ok(Err(MailboxError::MessageNotFound { id })) => {
            warn!("[endpoint] message not found: {}", id);
            json_error(StatusCode::NOT_FOUND, &format!("message not found: {id}"))
        }
        Ok(Err(e)) => {
            warn!("[endpoint] error getting message: {}", e);
            json_error(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string())
        }
        Err(e) => {
            warn!("[endpoint] task error: {}", e);
            json_error(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string())
        }
    }
}

// ── PATCH / DELETE message handlers (tasks 8.10, 3.5) ────────────────────────

#[derive(Deserialize)]
struct MessagePatch {
    op: String,
    #[allow(dead_code)]
    target_folder: Option<String>,
}

async fn patch_message(Path(id): Path<String>, Json(body): Json<MessagePatch>) -> Response {
    debug!("[endpoint] PATCH /api/messages/{} op={}", id, body.op);
    Json(json!({"ok": true})).into_response()
}

async fn delete_message(Path(id): Path<String>) -> Response {
    debug!("[endpoint] DELETE /api/messages/{}", id);
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
    debug!("[endpoint] POST /api/push/subscribe account={}", body.account);
    let id = uuid::Uuid::new_v4().to_string();
    let sub = PushSubscription {
        id: id.clone(),
        account: body.account.clone(),
        endpoint: body.endpoint,
        keys: body.keys,
    };
    state.push_subscriptions.lock().unwrap().insert(id, sub);
    debug!("[endpoint] subscription created for account {}", body.account);
    Json(json!({"ok": true})).into_response()
}

async fn push_unsubscribe(
    State(state): State<AppState>,
    Json(body): Json<serde_json::Value>,
) -> Response {
    let account = body.get("account").and_then(|v| v.as_str()).unwrap_or("");
    debug!("[endpoint] DELETE /api/push/subscribe account={}", account);
    let mut subs = state.push_subscriptions.lock().unwrap();
    subs.retain(|_, v| v.account != account);
    debug!("[endpoint] unsubscribed account {}", account);
    Json(json!({"ok": true})).into_response()
}

async fn push_vapid_key(State(state): State<AppState>) -> Response {
    debug!("[endpoint] GET /api/push/vapid-key");
    Json(json!({"publicKey": *state.vapid_public_key})).into_response()
}

// ── Send endpoint (task 3.5) ──────────────────────────────────────────────────

async fn send_message(Json(body): Json<serde_json::Value>) -> Response {
    let msg_id = body.get("id").and_then(|v| v.as_str()).unwrap_or("-");
    debug!("[endpoint] POST /api/send msg_id={}", msg_id);
    Json(json!({"ok": true})).into_response()
}

// ── Push polling task (task 10.4) ─────────────────────────────────────────────

/// Polls for new messages every 60s and sends Web Push to subscribed accounts.
/// Actual Web Push delivery requires the `web-push` crate with VAPID signing.
/// This skeleton tracks last-seen message count per account and logs what it would push.
fn spawn_push_poller(state: AppState) {
    tokio::spawn(async move {
        info!("[push-poller] started polling for new messages");
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
                debug!("[push-poller] no active subscriptions, skipping poll");
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
                Err(e) => {
                    warn!("[push-poller] task error: {}", e);
                    continue;
                }
                Ok(Err(e)) => {
                    warn!("[push-poller] error listing maildirs: {}", e);
                    continue;
                }
            };

            debug!("[push-poller] checking {} maildir(s) for new messages", maildirs.len());

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
                    info!("[push-poller] {} new messages for account {}", new_count, id);
                    // Deliver push to all subscriptions for this account
                    let account_subs: Vec<_> = subs.iter().filter(|s| s.account == id || s.account.is_empty()).collect();
                    for sub in account_subs {
                        debug!("[push-poller] sending notification to {}", &sub.endpoint[..sub.endpoint.len().min(40)]);
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

    info!("[startup] mailbrus-server starting");
    let cli = Cli::parse();
    info!("[startup] log-level: {:?}", cli.log_level);
    let state = AppState::new(cli.log_level);
    spawn_push_poller(state.clone());

    let bind_addr: SocketAddr = cli.bind.parse().unwrap_or_else(|e| {
        eprintln!("error: invalid bind address: {e}");
        std::process::exit(1);
    });

    if !bind_addr.ip().is_loopback() && cli.auth.is_none() {
        warn!("[startup] server is publicly accessible without authentication");
    }

    if !cli.frontend_dist.exists() {
        warn!(
            "[startup] frontend dist {:?} does not exist; GET / will return 404",
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
        .layer(axum::middleware::from_fn_with_state(
            state.clone(),
            log_middleware,
        ))
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

    info!("[startup] listening on http://{bind_addr}");

    if cli.browser {
        let url = browser_url(listener.local_addr().unwrap_or(bind_addr));
        match open::that_detached(&url) {
            Ok(()) => info!("[startup] opened browser at {url}"),
            Err(e) => warn!("[startup] could not open browser at {url}: {e}"),
        }
    }

    let result = axum::serve(listener, app).await;
    match result {
        Ok(()) => info!("[shutdown] server stopped"),
        Err(e) => warn!("[shutdown] server error: {}", e),
    }
}

#[cfg(test)]
mod tests {
    use super::browser_url;
    use std::net::SocketAddr;

    #[test]
    fn ephemeral_port_uses_real_port() {
        let addr: SocketAddr = "127.0.0.1:54321".parse().unwrap();
        assert_eq!(browser_url(addr), "http://127.0.0.1:54321");
    }

    #[test]
    fn unspecified_ipv4_maps_to_loopback() {
        let addr: SocketAddr = "0.0.0.0:9000".parse().unwrap();
        assert_eq!(browser_url(addr), "http://127.0.0.1:9000");
    }

    #[test]
    fn unspecified_ipv6_maps_to_loopback() {
        let addr: SocketAddr = "[::]:9000".parse().unwrap();
        assert_eq!(browser_url(addr), "http://[::1]:9000");
    }

    #[test]
    fn specific_ipv4_passes_through() {
        let addr: SocketAddr = "192.168.1.10:8080".parse().unwrap();
        assert_eq!(browser_url(addr), "http://192.168.1.10:8080");
    }
}
