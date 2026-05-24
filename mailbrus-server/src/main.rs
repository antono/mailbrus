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
        let vapid_public_key = std::env::var("VAPID_PUBLIC_KEY").unwrap_or_else(|_| {
            let raw: Vec<u8> = (0..65).map(|i| i as u8).collect();
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

// ── Sanitization pipeline ─────────────────────────────────────────────────────

/// Run ammonia allowlist pass then lol_html cid/src rewrite.
/// Returns (sanitized_html, has_remote_count).
fn sanitize_html(msg_id: &str, raw_html: &str) -> (String, usize) {
    use ammonia::Builder;
    use std::collections::HashSet;

    // ammonia allowlist pass — defaults already strip on*, id, name, style,
    // script/iframe/form/etc. We only need to add cid: to url_schemes so
    // cid: src attributes survive for the lol_html rewrite below.
    let mut url_schemes = HashSet::new();
    url_schemes.insert("cid");
    let clean = Builder::new()
        .add_url_schemes(url_schemes)
        .clean(raw_html)
        .to_string();

    debug!(
        "[render] ammonia pass: {} input bytes → {} output bytes",
        raw_html.len(),
        clean.len()
    );

    // lol_html rewrite pass: cid:X → /api/messages/:id/cid/X, remote src → data-mb-src
    let rewritten = rewrite_resources(msg_id, &clean);
    let has_remote = rewritten.matches("data-mb-src=").count();

    debug!(
        "[render] lol_html pass: {} remote resources neutralized",
        has_remote
    );

    (rewritten, has_remote)
}

fn rewrite_resources(msg_id: &str, html: &str) -> String {
    use lol_html::{element, HtmlRewriter, Settings};

    let msg_id = msg_id.to_string();
    let mut output: Vec<u8> = Vec::with_capacity(html.len());

    let result = {
        let mut rewriter = HtmlRewriter::new(
            Settings {
                element_content_handlers: vec![element!("img[src]", move |el| {
                    let src = el.get_attribute("src").unwrap_or_default();
                    if let Some(cid) = src.strip_prefix("cid:") {
                        el.set_attribute(
                            "src",
                            &format!("/api/messages/{msg_id}/cid/{cid}"),
                        )?;
                    } else if src.starts_with("http://") || src.starts_with("https://") {
                        el.set_attribute("data-mb-src", &src)?;
                        el.remove_attribute("src");
                    }
                    Ok(())
                })],
                ..Settings::new()
            },
            |c: &[u8]| output.extend_from_slice(c),
        );
        rewriter
            .write(html.as_bytes())
            .and_then(|_| rewriter.end())
    };

    if result.is_err() {
        return html.to_string();
    }

    String::from_utf8_lossy(&output).into_owned()
}

/// Convert HTML to readable plain text (Simple mode).
fn html_to_text(html: &str) -> String {
    html2text::from_read(html.as_bytes(), 100)
}

// ── MIME extraction ───────────────────────────────────────────────────────────

struct ParsedMessage {
    headers: Map<String, Value>,
    text_body: String,
    html_body: String,
    has_plain: bool,
    has_html: bool,
    format_flowed: bool,
    /// cid → (content-type, raw bytes); built for task 1.2, consumed by get_cid endpoint
    #[allow(dead_code)]
    cid_parts: HashMap<String, (String, Vec<u8>)>,
    attachments: Vec<Value>,
}

fn extract_message(raw: &[u8]) -> Option<ParsedMessage> {
    let msg = MessageParser::new().parse(raw)?;
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

    // Task 1.1: extract both text and html body parts
    let mut text_body = String::new();
    let mut format_flowed = false;
    for &pid in &msg.text_body {
        if let Some(part) = msg.parts.get(pid as usize) {
            if let PartType::Text(text) = &part.body {
                text_body = text.as_ref().to_string();
                // Task 1.3: detect format=flowed
                format_flowed = part
                    .content_type()
                    .and_then(|ct| ct.attribute("format"))
                    .map(|f| f.eq_ignore_ascii_case("flowed"))
                    .unwrap_or(false);
                break;
            }
        }
    }

    let mut html_body = String::new();
    for &pid in &msg.html_body {
        if let Some(part) = msg.parts.get(pid as usize) {
            if let PartType::Html(html) = &part.body {
                html_body = html.as_ref().to_string();
                break;
            }
        }
    }

    let has_plain = !text_body.is_empty();
    let has_html = !html_body.is_empty();

    // Task 1.2: collect cid: inline parts
    let mut cid_parts: HashMap<String, (String, Vec<u8>)> = HashMap::new();
    for part in &msg.parts {
        if let Some(cid) = part.content_id() {
            let cid = cid.trim_matches(['<', '>']).to_string();
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
            let bytes = match &part.body {
                PartType::Binary(b) | PartType::InlineBinary(b) => b.as_ref().to_vec(),
                PartType::Text(t) => t.as_bytes().to_vec(),
                _ => continue,
            };
            cid_parts.insert(cid, (mime, bytes));
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

    Some(ParsedMessage {
        headers,
        text_body,
        html_body,
        has_plain,
        has_html,
        format_flowed,
        cid_parts,
        attachments,
    })
}

/// Build the response body JSON for a given mode.
/// Task 3.1: mode=text|simple|html with has_remote, has_plain, has_html.
fn build_body_response(id: &str, parsed: ParsedMessage, mode: &str) -> Value {
    let ParsedMessage {
        headers,
        text_body,
        html_body,
        has_plain,
        has_html,
        format_flowed,
        attachments,
        ..
    } = parsed;

    // resolve mode: if "auto", pick text if plain exists else simple
    let resolved_mode = match mode {
        "html" => "html",
        "simple" => "simple",
        "text" => "text",
        _ => {
            if has_plain {
                "text"
            } else {
                "simple"
            }
        }
    };

    let (body, has_remote) = match resolved_mode {
        "html" => {
            if has_html {
                sanitize_html(id, &html_body)
            } else {
                // no html part — fall back to text wrapped in a pre
                let escaped = ammonia::clean(&format!("<pre>{text_body}</pre>"));
                (escaped, 0)
            }
        }
        "simple" => {
            let source = if has_html { &html_body } else { &text_body };
            (html_to_text(source), 0)
        }
        _ => (text_body, 0),
    };

    json!({
        "id": id,
        "headers": headers,
        "body": body,
        "mode": resolved_mode,
        "has_plain": has_plain,
        "has_html": has_html,
        "has_remote": has_remote,
        "format_flowed": format_flowed,
        "attachments": attachments,
    })
}


// ── Logging middleware ────────────────────────────────────────────────────────

async fn log_middleware(
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

async fn list_folders(Path(id): Path<String>) -> Response {
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
        Ok(Ok((messages, total))) => {
            let total_pages = (total as u64 + per_page - 1) / per_page;
            let body = json!({
                "messages": messages.iter().map(message_to_json).collect::<Vec<_>>(),
                "count": total,
                "page": page,
                "per_page": per_page,
            });
            debug!("[api] GET /api/maildirs/{}/folders/{}/messages body: page {}/{} count={} messages={}",
                maildir_id, folder_id, page, total_pages, total,
                body["messages"]);
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
struct SearchParams {
    q: Option<String>,
    page: Option<u64>,
    per_page: Option<u64>,
}

async fn search_messages(Query(params): Query<SearchParams>) -> Response {
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
            debug!("[api] GET /api/messages/search body: count={} messages={}", total, body["messages"]);
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

/// Task 3.1: ?mode=text|simple|html query parameter
#[derive(Deserialize)]
struct GetMessageQuery {
    mode: Option<String>,
}

async fn get_message(
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
                        // Fall back gracefully when the requested mode isn't available.
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

/// Task 3.2: serve inline cid: attachment bytes, validating cid belongs to the message.
async fn get_cid(Path((id, cid)): Path<(String, String)>) -> Response {
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
                        PartType::Binary(b) | PartType::InlineBinary(b) => {
                            b.as_ref().to_vec()
                        }
                        PartType::Text(t) => t.as_bytes().to_vec(),
                        _ => continue,
                    };
                    use axum::http::header;
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

// ── PATCH / DELETE message handlers ──────────────────────────────────────────

/// Save the raw HTML body of a message to ~/.cache/mailbrus/html/<id>.html
/// and open it in the system browser. Returns the absolute file path.
async fn open_message_html(Path(id): Path<String>) -> Response {
    match tokio::task::spawn_blocking(move || {
        let reader = MaildirReader::open()?;
        let raw = reader.get_message_body(&id)?;
        Ok::<_, MailboxError>((id, raw))
    })
    .await
    {
        Ok(Ok((id, raw))) => {
            let html = match extract_message(&raw) {
                Some(p) if !p.html_body.is_empty() => p.html_body,
                Some(p) => format!("<pre>{}</pre>", p.text_body),
                None => return json_error(StatusCode::NOT_FOUND, "message not found"),
            };

            // Build cache dir: $XDG_CACHE_HOME/mailbrus/html  (or ~/.cache/mailbrus/html)
            let cache_dir = std::env::var("XDG_CACHE_HOME")
                .map(std::path::PathBuf::from)
                .unwrap_or_else(|_| {
                    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
                    std::path::PathBuf::from(home).join(".cache")
                })
                .join("mailbrus/html");

            if let Err(e) = std::fs::create_dir_all(&cache_dir) {
                warn!("[render] failed to create cache dir {:?}: {}", cache_dir, e);
                return json_error(StatusCode::INTERNAL_SERVER_ERROR, "cannot create cache dir");
            }

            // Sanitize id for use as a filename
            let safe_id: String = id
                .chars()
                .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
                .collect();
            let path = cache_dir.join(format!("{safe_id}.html"));

            if let Err(e) = std::fs::write(&path, html.as_bytes()) {
                warn!("[render] failed to write html cache {:?}: {}", path, e);
                return json_error(StatusCode::INTERNAL_SERVER_ERROR, "cannot write html file");
            }

            info!("[render] saved html for {} → {:?}", id, path);

            match open::that_detached(&path) {
                Ok(()) => {
                    debug!("[render] opened {:?} in system browser", path);
                    Json(json!({"ok": true, "path": path.to_string_lossy()})).into_response()
                }
                Err(e) => {
                    warn!("[render] could not open {:?}: {}", path, e);
                    json_error(StatusCode::INTERNAL_SERVER_ERROR, "cannot open browser")
                }
            }
        }
        Ok(Err(MailboxError::MessageNotFound { id })) => {
            json_error(StatusCode::NOT_FOUND, &format!("message not found: {id}"))
        }
        Ok(Err(e)) => json_error(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()),
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()),
    }
}

#[derive(Deserialize)]
struct MessagePatch {
    op: String,
    #[allow(dead_code)]
    target_folder: Option<String>,
}

async fn patch_message(Path(id): Path<String>, Json(body): Json<MessagePatch>) -> Response {
    debug!("[api] PATCH /api/messages/{} op={}", id, body.op);
    Json(json!({"ok": true})).into_response()
}

async fn delete_message(Path(id): Path<String>) -> Response {
    debug!("[api] DELETE /api/messages/{}", id);
    Json(json!({"ok": true})).into_response()
}

// ── Push endpoints ────────────────────────────────────────────────────────────

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
    debug!("[api] POST /api/push/subscribe account={}", body.account);
    let id = uuid::Uuid::new_v4().to_string();
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

async fn push_unsubscribe(
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

async fn push_vapid_key(State(state): State<AppState>) -> Response {
    debug!("[api] GET /api/push/vapid-key");
    Json(json!({"publicKey": *state.vapid_public_key})).into_response()
}

// ── Send endpoint ─────────────────────────────────────────────────────────────

async fn send_message(Json(body): Json<serde_json::Value>) -> Response {
    let msg_id = body.get("id").and_then(|v| v.as_str()).unwrap_or("-");
    debug!("[api] POST /api/send msg_id={}", msg_id);
    Json(json!({"ok": true})).into_response()
}

// ── Push polling task ─────────────────────────────────────────────────────────

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

            debug!(
                "[push-poller] checking {} maildir(s) for new messages",
                maildirs.len()
            );

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
                    let account_subs: Vec<_> = subs
                        .iter()
                        .filter(|s| s.account == id || s.account.is_empty())
                        .collect();
                    for sub in account_subs {
                        debug!(
                            "[push-poller] sending notification to {}",
                            &sub.endpoint[..sub.endpoint.len().min(40)]
                        );
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
    let cli = Cli::parse();

    let env_filter = std::env::var("RUST_LOG").ok().map(|s| s.as_str().to_string());
    let default_level = match cli.log_level {
        LogLevel::Debug => "debug",
        LogLevel::Info => "info",
        LogLevel::Warn => "warn",
    };
    let filter_str = env_filter.as_deref().unwrap_or(default_level);

    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::new(filter_str))
        .init();

    info!("[startup] mailbrus-server starting");
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
        .route("/messages/{id}/cid/{cid}", get(get_cid))
        .route("/messages/{id}/open-html", post(open_message_html))
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
    use super::*;
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

    // Task 2.7: XSS vector sanitization tests
    #[test]
    fn sanitize_strips_script_tags() {
        let (out, _) = sanitize_html("id1", "<p>hi</p><script>alert(1)</script>");
        assert!(!out.contains("<script"), "script tag must be stripped");
        assert!(out.contains("hi"));
    }

    #[test]
    fn sanitize_strips_on_event_handlers() {
        let (out, _) = sanitize_html("id1", r#"<img src="x" onerror="alert(1)">"#);
        assert!(!out.contains("onerror"), "on* handlers must be stripped");
    }

    #[test]
    fn sanitize_strips_javascript_href() {
        let (out, _) = sanitize_html("id1", r#"<a href="javascript:alert(1)">click</a>"#);
        assert!(!out.contains("javascript:"), "javascript: href must be stripped");
    }

    #[test]
    fn sanitize_rewrites_cid_src() {
        let (out, remote) =
            sanitize_html("msg42", r#"<img src="cid:logo@example.com" alt="logo">"#);
        assert!(
            out.contains("/api/messages/msg42/cid/logo@example.com"),
            "cid: must be rewritten to api path"
        );
        assert_eq!(remote, 0, "cid is not a remote resource");
    }

    #[test]
    fn sanitize_neutralizes_remote_src() {
        let (out, remote) =
            sanitize_html("id1", r#"<img src="https://tracker.evil/p.gif" alt="">"#);
        // The bare `src` attribute must be gone; `data-mb-src` carries the original URL.
        // We check for ` src="http` (space-prefixed) to avoid matching inside `data-mb-src=`.
        assert!(!out.contains(" src=\"http"), "remote src must be neutralized");
        assert!(out.contains("data-mb-src="), "remote src moved to data-mb-src");
        assert_eq!(remote, 1);
    }

    #[test]
    fn sanitize_strips_iframe_element() {
        let (out, _) = sanitize_html("id1", "<iframe src='evil'></iframe>");
        assert!(!out.contains("<iframe"), "iframe must be stripped");
    }

    #[test]
    fn sanitize_strips_form_elements() {
        let (out, _) = sanitize_html("id1", "<form action='/steal'><input type='text'></form>");
        assert!(!out.contains("<form"), "form must be stripped");
        assert!(!out.contains("<input"), "input must be stripped");
    }

    #[test]
    fn sanitize_strips_meta_refresh() {
        let (out, _) = sanitize_html("id1", r#"<meta http-equiv="refresh" content="0;url=https://evil.example/phish"><p>Loading...</p>"#);
        eprintln!("meta-refresh output: {:?}", out);
        assert!(!out.contains("<meta"), "meta must be stripped: got {:?}", out);
    }

    #[test]
    fn extract_message_detects_html_only() {
        let raw = b"From: Test <t@x.com>\r\nTo: me@x.com\r\nSubject: S\r\n\
Date: Sat, 22 May 2026 09:00:00 +0000\r\nMessage-ID: <t@x.com>\r\nMIME-Version: 1.0\r\n\
Content-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n\
<p>Hello</p>\r\n";
        let parsed = extract_message(raw).expect("should parse");
        assert!(parsed.has_html, "html-only message must set has_html=true");
        assert!(!parsed.has_plain, "html-only message must have has_plain=false");
        assert!(parsed.html_body.contains("<p>Hello</p>"));
    }

    #[test]
    fn extract_message_detects_html_only_fixture() {
        let fixture_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .join("e2e/fixtures/maildir/alice@example.com/Inbox/cur/alice-inbox-07-html-only:2,S");
        let raw = std::fs::read(&fixture_path)
            .unwrap_or_else(|_| panic!("fixture not found: {}", fixture_path.display()));
        let parsed = extract_message(&raw).expect("should parse fixture");
        assert!(parsed.has_html, "html-only fixture must set has_html=true, got has_html={} has_plain={}", parsed.has_html, parsed.has_plain);
        assert!(!parsed.has_plain, "html-only fixture must have has_plain=false, got has_plain={}", parsed.has_plain);
    }

    #[test]
    fn extract_message_detects_multipart_alternative() {
        let boundary = "=_alt_=";
        let raw = format!(
            "From: Test <t@x.com>\r\nTo: me@x.com\r\nSubject: S\r\n\
Date: Sat, 22 May 2026 09:00:00 +0000\r\nMessage-ID: <t@x.com>\r\nMIME-Version: 1.0\r\n\
Content-Type: multipart/alternative; boundary=\"{boundary}\"\r\n\r\n\
--{boundary}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n\
Plain text\r\n\
--{boundary}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n\
<p>HTML</p>\r\n\
--{boundary}--\r\n"
        );
        let parsed = extract_message(raw.as_bytes()).expect("should parse");
        assert!(parsed.has_html, "multipart/alt must set has_html=true");
        assert!(parsed.has_plain, "multipart/alt must set has_plain=true");
        assert!(parsed.html_body.contains("<p>HTML</p>"));
        assert!(parsed.text_body.contains("Plain text"));
    }
}
