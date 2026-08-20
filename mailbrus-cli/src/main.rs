use clap::{Parser, Subcommand, ValueEnum};
use mail_parser::{MessageParser, MimeHeaders, PartType};
use mailbrus_core::{
    config::{load_config, AccountConfig},
    maildir_reader::{MaildirReader, SortBy, PaginationOpts},
    notmuch_db,
    sync::{ImapWorker, NotmuchLock, SyncProgress},
    MailboxError,
};
use serde_json::{json, Map, Value};
use std::io::{IsTerminal, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

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
    /// Fetch mail from IMAP into the mailbrus notmuch database. Blocks until done.
    Sync {
        /// Account id to sync. Omit to sync every configured account.
        account: Option<String>,
        /// Print a line per milestone (each prefixed with [fetched/total]).
        /// Without it, only a compact [fetched/total] indicator is redrawn.
        #[arg(short, long)]
        verbose: bool,
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

    // `sync` fetches mail (async, may run before any database exists), so it is
    // handled before opening the read-only reader used by every other command.
    if let Commands::Sync { account, verbose } = cli.command {
        return run_sync(account, verbose);
    }

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
        Commands::Sync { .. } => unreachable!("sync is handled before reader setup"),
    }

    Ok(())
}

/// Resolve an account's maildir root the same way the server does:
/// explicit `maildir_root`, else the XDG default, else `<db>/mail/<id>`.
fn resolve_maildir_root(account: &AccountConfig, db_path: &Path) -> PathBuf {
    account
        .imap()
        .and_then(|i| i.maildir_root.clone())
        .or_else(|| mailbrus_core::config::default_maildir_root(&account.id))
        .unwrap_or_else(|| db_path.join("mail").join(&account.id))
}

/// Entry point for `mailbrus sync`: spin up a Tokio runtime just for this
/// command and drive the core sync pipeline to completion.
fn run_sync(account: Option<String>, verbose: bool) -> Result<(), Box<dyn std::error::Error>> {
    let rt = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()?;
    rt.block_on(sync_accounts(account, verbose))
}

/// Human-readable text for a single `SyncProgress` milestone (no counter, no
/// account prefix — those are added by the printer). Never includes secrets.
fn describe(p: &SyncProgress) -> String {
    match p {
        SyncProgress::ResolvingCredentials { backend, reference } => match reference {
            Some(r) => format!("resolving password from {backend} (key: {r})"),
            None => format!("resolving password from {backend}"),
        },
        SyncProgress::CredentialsResolved { backend } => format!("fetched password from {backend}"),
        SyncProgress::Connecting { host, port } => format!("connecting to {host}:{port}"),
        SyncProgress::Authenticated => "authenticated".to_string(),
        SyncProgress::MailboxSelected { mailbox, uid_validity } => {
            format!("selected {mailbox} (uidvalidity {uid_validity})")
        }
        SyncProgress::NewMessages { count } => format!("{count} new message(s)"),
        SyncProgress::FetchingBatch { count } => format!("fetching {count} message(s)…"),
        SyncProgress::BatchFetched { count } => format!("received {count} message(s)"),
        SyncProgress::MessageFetched { uid } => format!("fetched uid {uid}"),
        SyncProgress::MessageStored { uid, path } => format!("stored uid {uid} -> {}", path.display()),
        SyncProgress::MessageFailed { uid, reason } => match uid {
            Some(u) => format!("FAILED uid {u}: {reason}"),
            None => format!("FAILED message: {reason}"),
        },
        SyncProgress::MessageDeleted { uid } => format!("deleted uid {uid}"),
        SyncProgress::FlagsUpdated { uid, flags } => {
            if flags.is_empty() {
                format!("cleared flags on uid {uid}")
            } else {
                format!("flags on uid {uid} -> {flags}")
            }
        }
        SyncProgress::RevisionDiverged { uid } => {
            format!("uid {uid} was edited locally; applying flag change anyway")
        }
        SyncProgress::IndexingStarted { count } => format!("indexing {count} message(s)…"),
        SyncProgress::IndexingProgress { indexed, total } => format!("indexed {indexed}/{total}"),
        SyncProgress::IndexingFinished { indexed } => format!("indexed {indexed} message(s)"),
    }
}

/// Renders sync progress for one account: a per-milestone log in verbose mode,
/// or a single redrawn `[fetched/total]` line otherwise. Shared into the worker's
/// progress sink, so it uses atomics for its counters.
struct ProgressPrinter {
    account: String,
    verbose: bool,
    tty: bool,
    total: AtomicUsize,
    done: AtomicUsize,
}

impl ProgressPrinter {
    fn new(account: String, verbose: bool) -> Self {
        Self {
            account,
            verbose,
            tty: std::io::stderr().is_terminal(),
            total: AtomicUsize::new(0),
            done: AtomicUsize::new(0),
        }
    }

    fn handle(&self, p: SyncProgress) {
        match &p {
            SyncProgress::NewMessages { count } => self.total.store(*count, Ordering::Relaxed),
            SyncProgress::MessageStored { .. } | SyncProgress::MessageFailed { .. } => {
                self.done.fetch_add(1, Ordering::Relaxed);
            }
            _ => {}
        }
        let done = self.done.load(Ordering::Relaxed);
        let total = self.total.load(Ordering::Relaxed);

        if self.verbose {
            eprintln!("[{done}/{total}] {}: {}", self.account, describe(&p));
        } else if self.tty {
            // Redraw a single status line in place.
            eprint!("\r[{done}/{total}] {} syncing…", self.account);
            let _ = std::io::stderr().flush();
        }
    }

    /// End the redrawn line (non-verbose TTY mode) so later output starts fresh.
    fn finish(&self) {
        if !self.verbose && self.tty {
            eprintln!();
        }
    }
}

async fn sync_accounts(
    account: Option<String>,
    verbose: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    let accounts = load_config(None)?;
    if accounts.is_empty() {
        return Err("no accounts configured in $XDG_CONFIG_HOME/mailbrus/config.toml".into());
    }
    if verbose {
        eprintln!("config: {} account(s) loaded", accounts.len());
    }

    let targets: Vec<AccountConfig> = match &account {
        Some(id) => vec![accounts
            .iter()
            .find(|a| &a.id == id)
            .cloned()
            .ok_or_else(|| format!("unknown account: {id}"))?],
        None => accounts.clone(),
    };

    // Own the database exactly as the server does: managed config + auto-init,
    // never touching the system ~/.notmuch-config.
    let db_path = notmuch_db::default_db_path()?;
    let config_path = notmuch_db::default_config_path()?;
    let maildir_roots: Vec<PathBuf> =
        accounts.iter().map(|a| resolve_maildir_root(a, &db_path)).collect();
    notmuch_db::write_config(&config_path, &db_path, &maildir_roots)?;
    notmuch_db::ensure_initialized(&db_path)?;

    let state_db_path = mailbrus_core::sync::state::default_path()?;
    let lock = NotmuchLock::default();

    let mut failures = 0usize;
    for acc in &targets {
        if verbose {
            eprintln!("{}: starting sync", acc.id);
        }
        let printer = Arc::new(ProgressPrinter::new(acc.id.clone(), verbose));
        let result = match ImapWorker::new(acc, db_path.clone(), lock.clone(), state_db_path.clone()) {
            Ok(worker) => {
                let sink = printer.clone();
                worker
                    .with_progress(move |p| sink.handle(p))
                    .sync()
                    .await
            }
            Err(e) => Err(e),
        };
        printer.finish();
        match result {
            Ok(report) => println!(
                "{}: fetched {}, deleted {}, indexed {}",
                acc.id, report.fetched, report.deleted, report.fetched
            ),
            Err(e) => {
                eprintln!("{}: sync failed: {e}", acc.id);
                failures += 1;
            }
        }
    }

    if failures > 0 {
        return Err(format!("{failures} account(s) failed to sync").into());
    }
    Ok(())
}

fn main() {
    if let Err(e) = run() {
        eprintln!("error: {e}");
        std::process::exit(1);
    }
}
