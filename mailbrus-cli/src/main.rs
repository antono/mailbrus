use clap::{Parser, Subcommand, ValueEnum};
use mailbrus_core::{
    maildir_reader::{MaildirReader, PaginationOpts, SortBy},
    MailboxError,
};
use serde_json::{json, Value};

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
    List {
        #[arg(short, long, default_value = "text")]
        output: OutputFormat,
    },
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
        Commands::Message { cmd: MessageCommands::List { output } } => {
            let (messages, _) = reader.list_messages(
                "*",
                SortBy::Newest,
                PaginationOpts { limit: 100, offset: 0 },
            )?;
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
            print_value(&json!(arr), &output);
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
