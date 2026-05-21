use std::path::{Path, PathBuf};

use crate::error::MailboxError;

pub struct Message {
    pub id: String,
    pub headers: Headers,
    pub flags: MaildirFlags,
}

#[derive(Clone, Default)]
pub struct Headers {
    pub from: Option<String>,
    pub to: Vec<String>,
    pub subject: Option<String>,
    pub date: Option<i64>,
    pub message_id: Option<String>,
    pub in_reply_to: Option<String>,
}

pub struct MaildirFlags {
    pub seen: bool,
    pub replied: bool,
    pub flagged: bool,
    pub deleted: bool,
    pub draft: bool,
}

pub struct PaginationOpts {
    pub limit: usize,
    pub offset: usize,
}

pub enum SortBy {
    Newest,
    Oldest,
    Subject,
    From,
    MessageId,
}

pub struct MaildirReader {
    db: notmuch::Database,
}

impl MaildirReader {
    pub fn new(db_path: impl AsRef<Path>) -> Result<Self, MailboxError> {
        let path = db_path.as_ref();
        let db = notmuch::Database::open_with_config(
            Some(path),
            notmuch::DatabaseMode::ReadOnly,
            None::<&std::path::Path>,
            None,
        )
        .map_err(|e| {
            use notmuch::{Error as NE, Status};
            match e {
                NE::NotmuchError(Status::PathError)
                | NE::NotmuchVerboseError(Status::PathError, _) => {
                    MailboxError::DatabaseNotFound { path: path.to_path_buf() }
                }
                NE::NotmuchError(Status::XapianException) => {
                    MailboxError::DatabaseCorrupted("xapian exception".to_string())
                }
                NE::NotmuchVerboseError(Status::XapianException, msg) => {
                    if msg.to_lowercase().contains("lock") {
                        MailboxError::DatabaseLocked
                    } else {
                        MailboxError::DatabaseCorrupted(msg)
                    }
                }
                e => MailboxError::QueryFailed(e.to_string()),
            }
        })?;
        Ok(Self { db })
    }

    pub fn list_messages(
        &self,
        query: &str,
        sort: SortBy,
        pagination: PaginationOpts,
    ) -> Result<(Vec<Message>, usize), MailboxError> {
        let q = self
            .db
            .create_query(query)
            .map_err(|e| MailboxError::QueryFailed(e.to_string()))?;

        q.set_sort(sort_to_notmuch(&sort));

        let total = q
            .count_messages()
            .map_err(|e| MailboxError::QueryFailed(e.to_string()))? as usize;

        let messages = q
            .search_messages()
            .map_err(|e| MailboxError::QueryFailed(e.to_string()))?;

        let mut result = Vec::new();
        for msg in messages.skip(pagination.offset).take(pagination.limit) {
            result.push(extract_message(&msg)?);
        }

        Ok((result, total))
    }

    pub fn get_message_body(&self, message_id: &str) -> Result<Vec<u8>, MailboxError> {
        let msg = self
            .db
            .find_message(message_id)
            .map_err(|e| MailboxError::QueryFailed(e.to_string()))?
            .ok_or_else(|| MailboxError::MessageNotFound { id: message_id.to_string() })?;

        let path = msg.filename().to_path_buf();
        std::fs::read(&path).map_err(|e| MailboxError::BodyReadFailed { path, reason: e })
    }

    /// Opens the notmuch database using the default user config (~/.notmuch-config).
    pub fn open() -> Result<Self, MailboxError> {
        let db = notmuch::Database::open_with_config(
            None::<&Path>,
            notmuch::DatabaseMode::ReadOnly,
            None::<&Path>,
            None,
        )
        .map_err(|e| MailboxError::QueryFailed(e.to_string()))?;
        Ok(Self { db })
    }

    pub fn list_maildirs(&self) -> Result<Vec<PathBuf>, MailboxError> {
        let root = self.db.path();
        let entries = std::fs::read_dir(root).map_err(|e| {
            MailboxError::QueryFailed(format!("cannot read {}: {e}", root.display()))
        })?;
        let mut accounts: Vec<PathBuf> = entries
            .filter_map(|e| e.ok())
            .filter(|e| {
                let name = e.file_name();
                let s = name.to_string_lossy();
                !s.starts_with('.') && e.path().is_dir()
            })
            .map(|e| e.path())
            .collect();
        accounts.sort();
        Ok(accounts)
    }

    pub fn list_folders(&self, maildir: &Path) -> Result<Vec<String>, MailboxError> {
        let entries = std::fs::read_dir(maildir).map_err(|e| {
            MailboxError::QueryFailed(format!("cannot read {}: {e}", maildir.display()))
        })?;
        let mut folders: Vec<String> = entries
            .filter_map(|e| e.ok())
            .filter(|e| {
                let name = e.file_name();
                let s = name.to_string_lossy();
                !s.starts_with('.') && e.path().is_dir()
            })
            .map(|e| e.file_name().to_string_lossy().to_string())
            .collect();
        folders.sort();
        Ok(folders)
    }
}

fn sort_to_notmuch(sort: &SortBy) -> notmuch::Sort {
    match sort {
        SortBy::Newest => notmuch::Sort::NewestFirst,
        SortBy::Oldest => notmuch::Sort::OldestFirst,
        SortBy::Subject | SortBy::From | SortBy::MessageId => notmuch::Sort::MessageID,
    }
}

fn extract_message(msg: &notmuch::Message) -> Result<Message, MailboxError> {
    let id = msg.id().to_string();

    let get_header = |name: &str| -> Result<Option<String>, MailboxError> {
        msg.header(name)
            .map(|opt| opt.map(|s| s.to_string()))
            .map_err(|e| MailboxError::QueryFailed(e.to_string()))
    };

    let to = get_header("To")?
        .map(|s| {
            s.split(',')
                .map(|p| p.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect()
        })
        .unwrap_or_default();

    let headers = Headers {
        from: get_header("From")?,
        to,
        subject: get_header("Subject")?,
        date: Some(msg.date()),
        message_id: get_header("Message-ID")?,
        in_reply_to: get_header("In-Reply-To")?,
    };

    let tag_list: Vec<String> = msg.tags().collect();
    let flags = tags_to_flags(&tag_list);

    Ok(Message { id, headers, flags })
}

fn tags_to_flags(tags: &[String]) -> MaildirFlags {
    MaildirFlags {
        seen: !tags.iter().any(|t| t == "unread"),
        replied: tags.iter().any(|t| t == "replied"),
        flagged: tags.iter().any(|t| t == "flagged"),
        deleted: tags.iter().any(|t| t == "deleted"),
        draft: tags.iter().any(|t| t == "draft"),
    }
}

#[cfg(test)]
mod tests {
    use std::{fs, path::Path};

    use super::*;

    static TEST_EMAIL: &[u8] = b"From: Alice <alice@example.com>\r\n\
To: Bob <bob@example.com>\r\n\
Subject: Hello World\r\n\
Date: Thu, 01 Jan 2026 12:00:00 +0000\r\n\
Message-ID: <test001@example.com>\r\n\
\r\n\
Hello!\r\n";

    /// Creates a notmuch db at `dir` with one message inside `dir/account@test/Inbox/cur/`.
    fn setup_test_db(dir: &Path) {
        let inbox = dir.join("account@test").join("Inbox").join("cur");
        fs::create_dir_all(&inbox).unwrap();
        let msg_path = inbox.join("test001:2,S");
        fs::write(&msg_path, TEST_EMAIL).unwrap();
        let db = notmuch::Database::create(dir).unwrap();
        db.index_file(&msg_path, None).unwrap();
    }

    fn unique_tmpdir() -> std::path::PathBuf {
        std::env::temp_dir().join(format!(
            "mailbrus-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }

    #[test]
    fn list_messages_returns_indexed_messages() {
        let dir = unique_tmpdir();
        setup_test_db(&dir);

        let reader = MaildirReader::new(&dir).unwrap();
        let (messages, total) = reader
            .list_messages("*", SortBy::Newest, PaginationOpts { limit: 10, offset: 0 })
            .unwrap();

        assert_eq!(total, 1);
        assert_eq!(messages.len(), 1);
        assert_eq!(messages[0].id, "test001@example.com");
        assert_eq!(messages[0].headers.subject.as_deref(), Some("Hello World"));
        assert!(messages[0].headers.from.as_deref().unwrap_or("").contains("Alice"));

        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn list_messages_pagination_offset() {
        let dir = unique_tmpdir();
        setup_test_db(&dir);

        let reader = MaildirReader::new(&dir).unwrap();
        let (messages, total) = reader
            .list_messages("*", SortBy::Newest, PaginationOpts { limit: 10, offset: 1 })
            .unwrap();

        assert_eq!(total, 1, "total reflects all messages, not paginated count");
        assert_eq!(messages.len(), 0, "offset past end returns empty");

        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn get_message_body_returns_raw_bytes() {
        let dir = unique_tmpdir();
        setup_test_db(&dir);

        let reader = MaildirReader::new(&dir).unwrap();
        let body = reader.get_message_body("test001@example.com").unwrap();

        assert!(!body.is_empty());
        assert!(body.windows(5).any(|w| w == b"Hello"));

        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn get_message_body_missing_id_returns_error() {
        let dir = unique_tmpdir();
        setup_test_db(&dir);

        let reader = MaildirReader::new(&dir).unwrap();
        let result = reader.get_message_body("nonexistent@example.com");

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("nonexistent@example.com"));

        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn list_maildirs_returns_account_dirs() {
        let dir = unique_tmpdir();
        setup_test_db(&dir); // creates dir/account@test/...

        let reader = MaildirReader::new(&dir).unwrap();
        let maildirs = reader.list_maildirs().unwrap();

        assert_eq!(maildirs.len(), 1);
        assert_eq!(maildirs[0], dir.join("account@test"));

        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn list_maildirs_excludes_hidden_dirs() {
        let dir = unique_tmpdir();
        setup_test_db(&dir); // creates .notmuch at root

        let reader = MaildirReader::new(&dir).unwrap();
        let maildirs = reader.list_maildirs().unwrap();

        assert!(!maildirs.iter().any(|p| {
            p.file_name().and_then(|n| n.to_str()).map_or(false, |s| s.starts_with('.'))
        }));

        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn list_folders_returns_maildir_subfolders() {
        let dir = unique_tmpdir();
        setup_test_db(&dir); // creates account@test/Inbox/
        let account_dir = dir.join("account@test");
        // add more folders alongside Inbox
        for name in &["Sent", "Drafts"] {
            fs::create_dir_all(account_dir.join(name).join("cur")).unwrap();
            fs::create_dir_all(account_dir.join(name).join("new")).unwrap();
            fs::create_dir_all(account_dir.join(name).join("tmp")).unwrap();
        }

        let reader = MaildirReader::new(&dir).unwrap();
        let folders = reader.list_folders(&account_dir).unwrap();

        assert_eq!(folders, vec!["Drafts", "Inbox", "Sent"]);

        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn list_folders_excludes_hidden_dirs() {
        let dir = unique_tmpdir();
        setup_test_db(&dir); // creates account@test/Inbox/
        let account_dir = dir.join("account@test");
        fs::create_dir_all(account_dir.join(".hidden")).unwrap();

        let reader = MaildirReader::new(&dir).unwrap();
        let folders = reader.list_folders(&account_dir).unwrap();

        assert!(folders.contains(&"Inbox".to_string()));
        assert!(!folders.iter().any(|f| f.starts_with('.')));

        fs::remove_dir_all(&dir).ok();
    }
}
