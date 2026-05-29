use std::path::{Path, PathBuf};

use rusqlite::{params, Connection, OptionalExtension};
use thiserror::Error;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ImapMailboxState {
    pub uid_validity: u32,
    pub highest_modseq: Option<u64>,
    pub last_sync_at: Option<String>,
}

#[derive(Debug, Error)]
pub enum SyncStateError {
    #[error("cannot resolve XDG data directory")]
    NoXdgData,
    #[error("cannot create directory {path}: {source}")]
    CreateDir {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error("sqlite error: {0}")]
    Sql(#[from] rusqlite::Error),
}

pub struct SyncStateDb {
    conn: Connection,
}

impl SyncStateDb {
    /// Open (and create if missing) the sync state DB at the given path.
    pub fn open(path: &Path) -> Result<Self, SyncStateError> {
        if let Some(parent) = path.parent() {
            if !parent.exists() {
                std::fs::create_dir_all(parent).map_err(|e| SyncStateError::CreateDir {
                    path: parent.to_path_buf(),
                    source: e,
                })?;
            }
        }
        let conn = Connection::open(path)?;
        init_schema(&conn)?;
        Ok(Self { conn })
    }

    /// Open the sync state DB at the default path
    /// `$XDG_DATA_HOME/mailbrus/sync.db`.
    pub fn open_default() -> Result<Self, SyncStateError> {
        let path = default_path()?;
        Self::open(&path)
    }

    pub fn get_mailbox_state(
        &self,
        account_id: &str,
        mailbox: &str,
    ) -> Result<Option<ImapMailboxState>, SyncStateError> {
        let mut stmt = self.conn.prepare(
            "SELECT uid_validity, highest_modseq, last_sync_at
             FROM imap_mailbox_state
             WHERE account_id = ?1 AND mailbox_name = ?2",
        )?;
        let result = stmt
            .query_row(params![account_id, mailbox], |row| {
                let uid_validity: i64 = row.get(0)?;
                let highest_modseq: Option<i64> = row.get(1)?;
                let last_sync_at: Option<String> = row.get(2)?;
                Ok(ImapMailboxState {
                    uid_validity: uid_validity as u32,
                    highest_modseq: highest_modseq.map(|v| v as u64),
                    last_sync_at,
                })
            })
            .optional()?;
        Ok(result)
    }

    pub fn save_mailbox_state(
        &self,
        account_id: &str,
        mailbox: &str,
        state: &ImapMailboxState,
    ) -> Result<(), SyncStateError> {
        self.conn.execute(
            "INSERT INTO imap_mailbox_state
                (account_id, mailbox_name, uid_validity, highest_modseq, last_sync_at)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(account_id, mailbox_name) DO UPDATE SET
                uid_validity = excluded.uid_validity,
                highest_modseq = excluded.highest_modseq,
                last_sync_at = excluded.last_sync_at",
            params![
                account_id,
                mailbox,
                state.uid_validity as i64,
                state.highest_modseq.map(|v| v as i64),
                state.last_sync_at,
            ],
        )?;
        Ok(())
    }

    /// Delete a mailbox state (used on UIDVALIDITY change to force resync).
    pub fn delete_mailbox_state(
        &self,
        account_id: &str,
        mailbox: &str,
    ) -> Result<(), SyncStateError> {
        self.conn.execute(
            "DELETE FROM imap_mailbox_state WHERE account_id = ?1 AND mailbox_name = ?2",
            params![account_id, mailbox],
        )?;
        Ok(())
    }
}

fn init_schema(conn: &Connection) -> Result<(), SyncStateError> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS imap_mailbox_state (
            account_id    TEXT NOT NULL,
            mailbox_name  TEXT NOT NULL,
            uid_validity  INTEGER NOT NULL,
            highest_modseq INTEGER,
            last_sync_at  TEXT,
            PRIMARY KEY (account_id, mailbox_name)
        );

         CREATE TABLE IF NOT EXISTS imap_message_uids (
            account_id    TEXT NOT NULL,
            mailbox_name  TEXT NOT NULL,
            uid           INTEGER NOT NULL,
            file_basename TEXT NOT NULL,
            PRIMARY KEY (account_id, mailbox_name, uid)
        );",
    )?;
    Ok(())
}

impl SyncStateDb {
    pub fn record_uid(
        &self,
        account_id: &str,
        mailbox: &str,
        uid: u32,
        file_basename: &str,
    ) -> Result<(), SyncStateError> {
        self.conn.execute(
            "INSERT INTO imap_message_uids
                (account_id, mailbox_name, uid, file_basename)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(account_id, mailbox_name, uid) DO UPDATE SET
                file_basename = excluded.file_basename",
            params![account_id, mailbox, uid as i64, file_basename],
        )?;
        Ok(())
    }

    pub fn forget_uid(
        &self,
        account_id: &str,
        mailbox: &str,
        uid: u32,
    ) -> Result<(), SyncStateError> {
        self.conn.execute(
            "DELETE FROM imap_message_uids
             WHERE account_id = ?1 AND mailbox_name = ?2 AND uid = ?3",
            params![account_id, mailbox, uid as i64],
        )?;
        Ok(())
    }

    pub fn list_stored_uids(
        &self,
        account_id: &str,
        mailbox: &str,
    ) -> Result<Vec<(u32, String)>, SyncStateError> {
        let mut stmt = self.conn.prepare(
            "SELECT uid, file_basename FROM imap_message_uids
             WHERE account_id = ?1 AND mailbox_name = ?2",
        )?;
        let rows = stmt
            .query_map(params![account_id, mailbox], |row| {
                let uid: i64 = row.get(0)?;
                let basename: String = row.get(1)?;
                Ok((uid as u32, basename))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    pub fn forget_all_uids_for_mailbox(
        &self,
        account_id: &str,
        mailbox: &str,
    ) -> Result<(), SyncStateError> {
        self.conn.execute(
            "DELETE FROM imap_message_uids
             WHERE account_id = ?1 AND mailbox_name = ?2",
            params![account_id, mailbox],
        )?;
        Ok(())
    }
}

pub fn default_path() -> Result<PathBuf, SyncStateError> {
    dirs::data_dir()
        .ok_or(SyncStateError::NoXdgData)
        .map(|d| d.join("mailbrus").join("sync.db"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp_db_path() -> PathBuf {
        std::env::temp_dir().join(format!(
            "mailbrus-syncstate-{}.db",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }

    #[test]
    fn schema_created_on_first_open() {
        let path = tmp_db_path();
        let db = SyncStateDb::open(&path).unwrap();
        let state = db.get_mailbox_state("acc1", "INBOX").unwrap();
        assert!(state.is_none(), "no state for unknown mailbox");
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn save_and_load_roundtrip() {
        let path = tmp_db_path();
        let db = SyncStateDb::open(&path).unwrap();

        let state = ImapMailboxState {
            uid_validity: 42,
            highest_modseq: Some(123456),
            last_sync_at: Some("2026-05-29T00:00:00Z".to_string()),
        };
        db.save_mailbox_state("acc1", "INBOX", &state).unwrap();

        let loaded = db.get_mailbox_state("acc1", "INBOX").unwrap().unwrap();
        assert_eq!(loaded, state);

        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn upsert_overwrites_existing() {
        let path = tmp_db_path();
        let db = SyncStateDb::open(&path).unwrap();

        let s1 = ImapMailboxState {
            uid_validity: 1,
            highest_modseq: Some(10),
            last_sync_at: None,
        };
        db.save_mailbox_state("acc1", "INBOX", &s1).unwrap();

        let s2 = ImapMailboxState {
            uid_validity: 2,
            highest_modseq: Some(20),
            last_sync_at: Some("now".to_string()),
        };
        db.save_mailbox_state("acc1", "INBOX", &s2).unwrap();

        let loaded = db.get_mailbox_state("acc1", "INBOX").unwrap().unwrap();
        assert_eq!(loaded, s2);

        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn delete_removes_state() {
        let path = tmp_db_path();
        let db = SyncStateDb::open(&path).unwrap();

        let state = ImapMailboxState {
            uid_validity: 1,
            highest_modseq: None,
            last_sync_at: None,
        };
        db.save_mailbox_state("acc1", "INBOX", &state).unwrap();
        db.delete_mailbox_state("acc1", "INBOX").unwrap();

        assert!(db.get_mailbox_state("acc1", "INBOX").unwrap().is_none());

        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn multiple_accounts_isolated() {
        let path = tmp_db_path();
        let db = SyncStateDb::open(&path).unwrap();

        let s1 = ImapMailboxState {
            uid_validity: 1,
            highest_modseq: Some(100),
            last_sync_at: None,
        };
        let s2 = ImapMailboxState {
            uid_validity: 2,
            highest_modseq: Some(200),
            last_sync_at: None,
        };
        db.save_mailbox_state("acc1", "INBOX", &s1).unwrap();
        db.save_mailbox_state("acc2", "INBOX", &s2).unwrap();

        assert_eq!(db.get_mailbox_state("acc1", "INBOX").unwrap().unwrap(), s1);
        assert_eq!(db.get_mailbox_state("acc2", "INBOX").unwrap().unwrap(), s2);

        std::fs::remove_file(&path).ok();
    }
}
