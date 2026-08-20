use std::path::{Path, PathBuf};

use rusqlite::{params, Connection, OptionalExtension};
use thiserror::Error;

/// Current on-disk schema version, tracked in `PRAGMA user_version`.
///
/// v1 (recorded as `0`, since it never set the pragma) keyed each message by
/// `file_basename`. Because a maildir basename encodes the message flags, that
/// key is invalidated by the very rename a flag update performs — so v2 re-keys
/// to the identifier assigned at delivery.
const SCHEMA_VERSION: i64 = 2;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ImapMailboxState {
    pub uid_validity: u32,
    pub highest_modseq: Option<u64>,
    pub last_sync_at: Option<String>,
}

/// Per-message sync state for one stored UID.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StoredMessage {
    pub uid: u32,
    /// Identifier minted by the maildir delivery, stable across flag renames.
    pub maildir_id: String,
    /// Last-known server flags, normalised (see [`normalize_flags`]).
    pub flags: String,
    /// Hex sha256 of the bytes as delivered, used to detect a local edit.
    pub revision: String,
}

/// Normalise a maildir flag string so comparison cannot report a spurious
/// change from ordering or repetition: sorted, de-duplicated.
///
/// The maildir spec requires flags in ASCII order, but servers report IMAP
/// flags in arbitrary order, so we normalise on the way in.
pub fn normalize_flags(flags: &str) -> String {
    let mut chars: Vec<char> = flags.chars().collect();
    chars.sort_unstable();
    chars.dedup();
    chars.into_iter().collect()
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
    let user_version: i64 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;

    // A v1 database and a brand-new one are indistinguishable by pragma alone —
    // v1 never set `user_version`, so both report 0. Presence of the dropped
    // `file_basename` column is what actually identifies a v1 database.
    if user_version < SCHEMA_VERSION && has_legacy_message_table(conn)? {
        migrate_v1_to_v2(conn)?;
    }

    create_current_schema(conn)?;

    if user_version < SCHEMA_VERSION {
        conn.pragma_update(None, "user_version", SCHEMA_VERSION)?;
    }
    Ok(())
}

fn create_current_schema(conn: &Connection) -> Result<(), SyncStateError> {
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
            maildir_id    TEXT NOT NULL,
            flags         TEXT NOT NULL,
            revision      TEXT NOT NULL,
            PRIMARY KEY (account_id, mailbox_name, uid)
        );

         CREATE TABLE IF NOT EXISTS legacy_maildir_files (
            account_id    TEXT NOT NULL,
            mailbox_name  TEXT NOT NULL,
            file_basename TEXT NOT NULL,
            PRIMARY KEY (account_id, mailbox_name, file_basename)
        );",
    )?;
    Ok(())
}

fn has_legacy_message_table(conn: &Connection) -> Result<bool, SyncStateError> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('imap_message_uids')
         WHERE name = 'file_basename'",
        [],
        |row| row.get(0),
    )?;
    Ok(count > 0)
}

/// Migrate a v1 database, discarding per-message state so the next sync
/// re-delivers every message through the atomic path.
///
/// Ordering is load-bearing. The legacy basenames are copied into
/// `legacy_maildir_files` *before* the column holding them is dropped —
/// otherwise the files re-delivery orphans become unreachable, since
/// re-delivery mints new filenames and the old ones would linger in `cur/`
/// still indexed by notmuch. The sync worker drains that table (it, not this
/// module, knows each account's maildir root), so an interrupted migration
/// still unlinks on the next run.
///
/// Mailbox cursors go too: keeping `highest_modseq` while dropping per-message
/// rows would make the next CONDSTORE sync fetch only messages changed since
/// that modseq and permanently skip everything else.
fn migrate_v1_to_v2(conn: &Connection) -> Result<(), SyncStateError> {
    conn.execute_batch(
        "BEGIN;

         CREATE TABLE IF NOT EXISTS legacy_maildir_files (
            account_id    TEXT NOT NULL,
            mailbox_name  TEXT NOT NULL,
            file_basename TEXT NOT NULL,
            PRIMARY KEY (account_id, mailbox_name, file_basename)
         );

         INSERT OR IGNORE INTO legacy_maildir_files
            (account_id, mailbox_name, file_basename)
         SELECT account_id, mailbox_name, file_basename FROM imap_message_uids;

         DROP TABLE imap_message_uids;

         DELETE FROM imap_mailbox_state;

         COMMIT;",
    )?;
    Ok(())
}

impl SyncStateDb {
    /// Record a freshly delivered message. `flags` is normalised on the way in.
    pub fn record_uid(
        &self,
        account_id: &str,
        mailbox: &str,
        uid: u32,
        maildir_id: &str,
        flags: &str,
        revision: &str,
    ) -> Result<(), SyncStateError> {
        self.conn.execute(
            "INSERT INTO imap_message_uids
                (account_id, mailbox_name, uid, maildir_id, flags, revision)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(account_id, mailbox_name, uid) DO UPDATE SET
                maildir_id = excluded.maildir_id,
                flags = excluded.flags,
                revision = excluded.revision",
            params![
                account_id,
                mailbox,
                uid as i64,
                maildir_id,
                normalize_flags(flags),
                revision
            ],
        )?;
        Ok(())
    }

    /// Update the recorded flags (and revision baseline) for a stored UID
    /// in place, leaving `maildir_id` untouched.
    pub fn update_flags(
        &self,
        account_id: &str,
        mailbox: &str,
        uid: u32,
        flags: &str,
        revision: &str,
    ) -> Result<(), SyncStateError> {
        self.conn.execute(
            "UPDATE imap_message_uids
                SET flags = ?4, revision = ?5
              WHERE account_id = ?1 AND mailbox_name = ?2 AND uid = ?3",
            params![
                account_id,
                mailbox,
                uid as i64,
                normalize_flags(flags),
                revision
            ],
        )?;
        Ok(())
    }

    /// Legacy maildir basenames preserved by the v1 -> v2 migration, awaiting
    /// unlink by the sync worker (which knows the account's maildir root).
    pub fn legacy_maildir_files(
        &self,
        account_id: &str,
        mailbox: &str,
    ) -> Result<Vec<String>, SyncStateError> {
        let mut stmt = self.conn.prepare(
            "SELECT file_basename FROM legacy_maildir_files
             WHERE account_id = ?1 AND mailbox_name = ?2",
        )?;
        let rows = stmt
            .query_map(params![account_id, mailbox], |row| row.get::<_, String>(0))?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    /// Drop the legacy-file records for a mailbox once they have been unlinked.
    pub fn clear_legacy_maildir_files(
        &self,
        account_id: &str,
        mailbox: &str,
    ) -> Result<(), SyncStateError> {
        self.conn.execute(
            "DELETE FROM legacy_maildir_files
             WHERE account_id = ?1 AND mailbox_name = ?2",
            params![account_id, mailbox],
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
    ) -> Result<Vec<StoredMessage>, SyncStateError> {
        let mut stmt = self.conn.prepare(
            "SELECT uid, maildir_id, flags, revision FROM imap_message_uids
             WHERE account_id = ?1 AND mailbox_name = ?2",
        )?;
        let rows = stmt
            .query_map(params![account_id, mailbox], |row| {
                let uid: i64 = row.get(0)?;
                Ok(StoredMessage {
                    uid: uid as u32,
                    maildir_id: row.get(1)?,
                    flags: row.get(2)?,
                    revision: row.get(3)?,
                })
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

    /// Build a v1 database by hand: the pre-migration schema, with
    /// `user_version` left at 0 exactly as v1 left it.
    fn make_v1_db(path: &Path, rows: &[(&str, &str, u32, &str)]) {
        let conn = Connection::open(path).unwrap();
        conn.execute_batch(
            "CREATE TABLE imap_mailbox_state (
                account_id    TEXT NOT NULL,
                mailbox_name  TEXT NOT NULL,
                uid_validity  INTEGER NOT NULL,
                highest_modseq INTEGER,
                last_sync_at  TEXT,
                PRIMARY KEY (account_id, mailbox_name)
             );
             CREATE TABLE imap_message_uids (
                account_id    TEXT NOT NULL,
                mailbox_name  TEXT NOT NULL,
                uid           INTEGER NOT NULL,
                file_basename TEXT NOT NULL,
                PRIMARY KEY (account_id, mailbox_name, uid)
             );",
        )
        .unwrap();
        conn.execute(
            "INSERT INTO imap_mailbox_state
                (account_id, mailbox_name, uid_validity, highest_modseq, last_sync_at)
             VALUES ('acc1', 'INBOX', 42, 9999, '2026-01-01T00:00:00Z')",
            [],
        )
        .unwrap();
        for (acc, mbox, uid, basename) in rows {
            conn.execute(
                "INSERT INTO imap_message_uids
                    (account_id, mailbox_name, uid, file_basename)
                 VALUES (?1, ?2, ?3, ?4)",
                params![acc, mbox, *uid as i64, basename],
            )
            .unwrap();
        }
        let v: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
        assert_eq!(v, 0, "a v1 database never set user_version");
    }

    #[test]
    fn v1_migration_preserves_basenames_resets_cursors_and_stamps_version() {
        let path = tmp_db_path();
        make_v1_db(
            &path,
            &[
                ("acc1", "INBOX", 137, "42_137.mailbrus:2,S"),
                ("acc1", "INBOX", 138, "42_138.mailbrus:2,"),
            ],
        );

        let db = SyncStateDb::open(&path).unwrap();

        // Per-message state is discarded so the next sync re-delivers.
        assert!(
            db.list_stored_uids("acc1", "INBOX").unwrap().is_empty(),
            "v2 must start with no per-message rows"
        );

        // The basenames survive, so the worker can unlink the old files. Without
        // this, re-delivery would mint new names and the originals would linger
        // in cur/ still indexed by notmuch.
        let mut legacy = db.legacy_maildir_files("acc1", "INBOX").unwrap();
        legacy.sort();
        assert_eq!(legacy, vec!["42_137.mailbrus:2,S", "42_138.mailbrus:2,"]);

        // Cursors must reset too: keeping highest_modseq while dropping the
        // per-message rows would make the next CONDSTORE sync fetch only what
        // changed since that modseq and permanently skip everything else.
        assert!(
            db.get_mailbox_state("acc1", "INBOX").unwrap().is_none(),
            "uid_validity/highest_modseq must be cleared"
        );

        let conn = Connection::open(&path).unwrap();
        let v: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
        assert_eq!(v, SCHEMA_VERSION);

        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn migration_is_idempotent_across_reopen() {
        let path = tmp_db_path();
        make_v1_db(&path, &[("acc1", "INBOX", 137, "42_137.mailbrus:2,S")]);

        {
            let db = SyncStateDb::open(&path).unwrap();
            db.record_uid("acc1", "INBOX", 200, "id-200", "S", "rev200")
                .unwrap();
            db.clear_legacy_maildir_files("acc1", "INBOX").unwrap();
        }

        // Reopening must not re-run the migration and wipe live v2 state.
        let db = SyncStateDb::open(&path).unwrap();
        let stored = db.list_stored_uids("acc1", "INBOX").unwrap();
        assert_eq!(stored.len(), 1, "second open must not drop v2 rows");
        assert_eq!(stored[0].maildir_id, "id-200");

        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn fresh_database_is_v2_without_migrating() {
        let path = tmp_db_path();
        let db = SyncStateDb::open(&path).unwrap();
        assert!(db.legacy_maildir_files("acc1", "INBOX").unwrap().is_empty());

        let conn = Connection::open(&path).unwrap();
        let v: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
        assert_eq!(v, SCHEMA_VERSION);

        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn normalize_flags_is_order_and_duplicate_insensitive() {
        assert_eq!(normalize_flags("SF"), normalize_flags("FS"));
        assert_eq!(normalize_flags("SF"), "FS");
        assert_eq!(normalize_flags("SSFF"), "FS");
        assert_eq!(normalize_flags(""), "");
        // Idempotent, so it is safe to apply on both sides of a comparison.
        assert_eq!(normalize_flags(&normalize_flags("TSRFD")), normalize_flags("TSRFD"));
    }

    #[test]
    fn record_and_update_flags_keep_the_maildir_id_and_normalise() {
        let path = tmp_db_path();
        let db = SyncStateDb::open(&path).unwrap();

        // Deliberately unsorted on the way in.
        db.record_uid("acc1", "INBOX", 137, "id-137", "SF", "rev1")
            .unwrap();
        let stored = db.list_stored_uids("acc1", "INBOX").unwrap();
        assert_eq!(stored.len(), 1);
        assert_eq!(stored[0].flags, "FS", "flags are stored normalised");
        assert_eq!(stored[0].revision, "rev1");

        db.update_flags("acc1", "INBOX", 137, "TFS", "rev2").unwrap();
        let stored = db.list_stored_uids("acc1", "INBOX").unwrap();
        assert_eq!(stored.len(), 1, "flag update must not insert a second row");
        assert_eq!(
            stored[0].maildir_id, "id-137",
            "the identifier must survive a flag change"
        );
        assert_eq!(stored[0].flags, "FST");
        assert_eq!(stored[0].revision, "rev2");

        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn legacy_files_are_scoped_per_mailbox() {
        let path = tmp_db_path();
        make_v1_db(
            &path,
            &[
                ("acc1", "INBOX", 1, "a:2,"),
                ("acc1", "Archive", 2, "b:2,S"),
            ],
        );
        let db = SyncStateDb::open(&path).unwrap();

        assert_eq!(db.legacy_maildir_files("acc1", "INBOX").unwrap(), vec!["a:2,"]);
        db.clear_legacy_maildir_files("acc1", "INBOX").unwrap();
        assert!(db.legacy_maildir_files("acc1", "INBOX").unwrap().is_empty());
        assert_eq!(
            db.legacy_maildir_files("acc1", "Archive").unwrap(),
            vec!["b:2,S"],
            "clearing one mailbox must not affect another"
        );

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
