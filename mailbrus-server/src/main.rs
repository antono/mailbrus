use axum::{
    extract::{Path, Query},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::get,
    Json, Router,
};
use clap::Parser;
use mail_parser::{MessageParser, MimeHeaders, PartType};
use mailbrus_core::{
    maildir_reader::{MaildirReader, Message, PaginationOpts, SortBy},
    MailboxError,
};
use serde::Deserialize;
use serde_json::{json, Map, Value};
use std::{net::SocketAddr, path::PathBuf};
use tower_http::services::{ServeDir, ServeFile};

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

// ── Main ──────────────────────────────────────────────────────────────────────

#[tokio::main]
async fn main() {
    let cli = Cli::parse();

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
        .route("/messages/{id}", get(get_message));

    let index = cli.frontend_dist.join("index.html");
    let serve_dir = ServeDir::new(&cli.frontend_dist).not_found_service(ServeFile::new(&index));

    let app = Router::new().nest("/api", api).fallback_service(serve_dir);

    let listener = tokio::net::TcpListener::bind(bind_addr)
        .await
        .unwrap_or_else(|e| {
            eprintln!("error: cannot bind {bind_addr}: {e}");
            std::process::exit(1);
        });

    println!("Listening on http://{bind_addr}");
    axum::serve(listener, app).await.expect("server error");
}
