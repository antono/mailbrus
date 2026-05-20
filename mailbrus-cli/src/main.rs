use clap::{Parser, Subcommand, ValueEnum};
use mail_parser::{MessageParser, MimeHeaders, PartType};
use mailbrus_core::{
    maildir_reader::{MaildirReader, SortBy, PaginationOpts},
    MailboxError,
};
use serde_json::{json, Map, Value};

#[derive(Parser)]
#[command(name = "mailbrus", version)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    Maildir {
        #[command(subcommand)]
        cmd: MaildirCommands,
    },
    Folder {
        #[command(subcommand)]
        cmd: FolderCommands,
    },
    Message {
        #[command(subcommand)]
        cmd: MessageCommands,
    },
}

#[derive(Subcommand)]
enum MaildirCommands {
    List {
        #[arg(short, long, default_value = "text")]
        output: OutputFormat,
    },
}

#[derive(Subcommand)]
enum FolderCommands {
    List {
        #[arg(short, long, default_value = "text")]
        output: OutputFormat,
    },
}

#[derive(Subcommand)]
enum MessageCommands {
    /// List messages (newest first). Use --page and --per-page to paginate (default: 25 per page).
    List {
        #[arg(short, long, default_value = "text")]
        output: OutputFormat,
        #[command(flatten)]
        pagination: PaginationArgs,
    },
    /// Search messages by notmuch query. Use --page and --per-page to paginate (default: 25 per page).
    Search {
        /// Notmuch query string (e.g. "tag:inbox", "from:alice", "subject:invoice")
        query: String,
        #[arg(short, long, default_value = "text")]
        output: OutputFormat,
        #[command(flatten)]
        pagination: PaginationArgs,
    },
    /// Read a single message by notmuch message ID. Use --output to control format (default: text).
    Read {
        /// Notmuch message ID (e.g. from `message list --output json`)
        id: String,
        #[arg(short, long, default_value = "text")]
        output: OutputFormat,
    },
}

/// Pagination options. Results are ordered newest-first.
#[derive(Parser, Clone)]
struct PaginationArgs {
    /// Page number (1-based). Defaults to 1.
    #[arg(long, default_value = "1", value_parser = clap::value_parser!(u64).range(1..))]
    page: u64,
    /// Number of results per page. Defaults to 25.
    #[arg(long, default_value = "25", value_parser = clap::value_parser!(u64).range(1..))]
    per_page: u64,
}

impl PaginationArgs {
    fn to_opts(&self) -> PaginationOpts {
        PaginationOpts {
            limit: self.per_page as usize,
            offset: ((self.page - 1) * self.per_page) as usize,
        }
    }
}

#[derive(ValueEnum, Clone)]
enum OutputFormat {
    Text,
    Json,
    Toon,
}

fn print_strings(items: &[String], fmt: &OutputFormat) {
    match fmt {
        OutputFormat::Text => items.iter().for_each(|s| println!("{s}")),
        OutputFormat::Json => {
            println!("{}", serde_json::to_string_pretty(&json!(items)).unwrap())
        }
        OutputFormat::Toon => {
            println!("{}", toon_format::encode_default(&json!(items)).unwrap_or_else(|e| e.to_string()))
        }
    }
}

fn print_value(value: &Value, fmt: &OutputFormat) {
    match fmt {
        OutputFormat::Text => {
            if let Some(arr) = value.as_array() {
                for item in arr {
                    let from = item["from"].as_str().unwrap_or("?");
                    let subject = item["subject"].as_str().unwrap_or("(no subject)");
                    let date = item["date"].as_i64().map(|d| d.to_string()).unwrap_or_default();
                    println!("{from} | {subject} | {date}");
                }
            }
        }
        OutputFormat::Json => println!("{}", serde_json::to_string_pretty(value).unwrap()),
        OutputFormat::Toon => {
            println!("{}", toon_format::encode_default(value).unwrap_or_else(|e| e.to_string()))
        }
    }
}

fn parse_message(id: &str, raw: &[u8]) -> Value {
    let msg = match MessageParser::new().parse(raw) {
        Some(m) => m,
        None => return json!({"id": id, "headers": {}, "parts": []}),
    };

    // Collect all headers from part 0, grouped by name as arrays of raw strings
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

    // Build parts: text, html, attachments
    let mut parts: Vec<Value> = Vec::new();
    for &pid in &msg.text_body {
        if let Some(part) = msg.parts.get(pid as usize) {
            if let PartType::Text(text) = &part.body {
                parts.push(json!({"type": "text/plain", "content": text.as_ref()}));
            }
        }
    }
    for &pid in &msg.html_body {
        if let Some(part) = msg.parts.get(pid as usize) {
            if let PartType::Html(html) = &part.body {
                parts.push(json!({"type": "text/html", "content": html.as_ref()}));
            }
        }
    }
    for &pid in &msg.attachments {
        if let Some(part) = msg.parts.get(pid as usize) {
            let content_type = part
                .content_type()
                .map(|ct| {
                    format!(
                        "{}/{}",
                        ct.c_type,
                        ct.c_subtype.as_deref().unwrap_or("octet-stream")
                    )
                })
                .unwrap_or_else(|| "application/octet-stream".to_string());
            let filename = part
                .content_disposition()
                .and_then(|cd| cd.attribute("filename"))
                .or_else(|| part.content_type().and_then(|ct| ct.attribute("name")))
                .unwrap_or("unnamed");
            parts.push(json!({"type": "attachment", "filename": filename, "content_type": content_type}));
        }
    }

    json!({"id": id, "headers": headers, "parts": parts})
}

fn print_message(id: &str, raw: &[u8], fmt: &OutputFormat) {
    let value = parse_message(id, raw);
    match fmt {
        OutputFormat::Text => {
            let parts = value["parts"].as_array().map(|v| v.as_slice()).unwrap_or(&[]);
            // First text/plain, fall back to text/html
            let body = parts
                .iter()
                .find(|p| p["type"] == "text/plain")
                .or_else(|| parts.iter().find(|p| p["type"] == "text/html"))
                .and_then(|p| p["content"].as_str())
                .unwrap_or("");
            print!("{body}");
            let attachments: Vec<&str> = parts
                .iter()
                .filter(|p| p["type"] == "attachment")
                .filter_map(|p| p["filename"].as_str())
                .collect();
            if !attachments.is_empty() {
                println!("\n-- Attachments --");
                for name in attachments {
                    println!("{name}");
                }
            }
        }
        OutputFormat::Json => println!("{}", serde_json::to_string_pretty(&value).unwrap()),
        OutputFormat::Toon => {
            println!("{}", toon_format::encode_default(&value).unwrap_or_else(|e| e.to_string()))
        }
    }
}

fn messages_to_json(messages: &[mailbrus_core::maildir_reader::Message]) -> Value {
    let arr: Vec<Value> = messages
        .iter()
        .map(|m| {
            json!({
                "id": m.id,
                "from": m.headers.from,
                "subject": m.headers.subject,
                "date": m.headers.date,
            })
        })
        .collect();
    json!(arr)
}

fn run() -> Result<(), Box<dyn std::error::Error>> {
    let cli = Cli::parse();
    let reader = MaildirReader::open().map_err(|e: MailboxError| e.to_string())?;

    match cli.command {
        Commands::Maildir { cmd: MaildirCommands::List { output } } => {
            let maildirs = reader.list_maildirs()?;
            let paths: Vec<String> = maildirs.iter().map(|p| p.display().to_string()).collect();
            print_strings(&paths, &output);
        }
        Commands::Folder { cmd: FolderCommands::List { output } } => {
            let maildirs = reader.list_maildirs()?;
            let maildir = maildirs
                .first()
                .ok_or("no maildirs configured in notmuch")?;
            let folders = reader.list_folders(maildir)?;
            print_strings(&folders, &output);
        }
        Commands::Message { cmd: MessageCommands::List { output, pagination } } => {
            let (messages, _) = reader.list_messages("*", SortBy::Newest, pagination.to_opts())?;
            print_value(&messages_to_json(&messages), &output);
        }
        Commands::Message { cmd: MessageCommands::Search { query, output, pagination } } => {
            if query.trim().is_empty() {
                return Err("query must not be empty".into());
            }
            let (messages, _) = reader.list_messages(&query, SortBy::Newest, pagination.to_opts())?;
            print_value(&messages_to_json(&messages), &output);
        }
        Commands::Message { cmd: MessageCommands::Read { id, output } } => {
            let raw = reader.get_message_body(&id).map_err(|e| match e {
                MailboxError::MessageNotFound { .. } => {
                    format!("message not found: {id}").into()
                }
                other => Box::new(other) as Box<dyn std::error::Error>,
            })?;
            print_message(&id, &raw, &output);
        }
    }

    Ok(())
}

fn main() {
    if let Err(e) = run() {
        eprintln!("error: {e}");
        std::process::exit(1);
    }
}
