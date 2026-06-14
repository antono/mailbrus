//! Mailbrus-owned notmuch database: path resolution, auto-init, config generation.
//!
//! Mailbrus manages its own isolated notmuch database rooted at
//! `$XDG_DATA_HOME/mailbrus/`. The Xapian index lives in the hidden `.notmuch/`
//! subdirectory; account maildirs live under `mail/<account-id>/`, all within
//! the database root so notmuch's `index_file` accepts them (libnotmuch
//! requires every indexed file to live under the database path). The system
//! `~/.notmuch-config` is never read or written.

use std::io::Write;
use std::path::{Path, PathBuf};

use thiserror::Error;
use tracing::{info, warn};

#[derive(Debug, Error)]
pub enum NotmuchDbError {
    #[error("cannot resolve XDG data directory")]
    NoXdgData,
    #[error("create notmuch database at {path}: {message}")]
    Create { path: PathBuf, message: String },
    #[error("write notmuch config {path}: {source}")]
    WriteConfig {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
}

/// Root of the mailbrus-owned notmuch database
/// (`$XDG_DATA_HOME/mailbrus/`, typically `~/.local/share/mailbrus/`).
///
/// The Xapian index is created inside the hidden `.notmuch/` subdirectory of
/// this path; account maildirs live under `mail/<account-id>/` so they fall
/// within the database root.
pub fn default_db_path() -> Result<PathBuf, NotmuchDbError> {
    dirs::data_dir()
        .ok_or(NotmuchDbError::NoXdgData)
        .map(|d| d.join("mailbrus"))
}

/// Path of the mailbrus-managed notmuch config file
/// (`$XDG_DATA_HOME/mailbrus/notmuch.cfg`). This file is owned by mailbrus and
/// is distinct from the system `~/.notmuch-config`, which is never touched.
pub fn default_config_path() -> Result<PathBuf, NotmuchDbError> {
    dirs::data_dir()
        .ok_or(NotmuchDbError::NoXdgData)
        .map(|d| d.join("mailbrus").join("notmuch.cfg"))
}

/// Create the notmuch database at `db_path` if it does not yet exist.
///
/// Idempotent: if `<db_path>/.notmuch/` already exists the database is left
/// untouched. Otherwise the parent directory is created and a fresh notmuch
/// database is initialized (the equivalent of `notmuch new` on an empty tree),
/// so no manual user action is required before the first sync.
pub fn ensure_initialized(db_path: &Path) -> Result<(), NotmuchDbError> {
    if db_path.join(".notmuch").is_dir() {
        return Ok(());
    }
    std::fs::create_dir_all(db_path).map_err(|e| NotmuchDbError::Create {
        path: db_path.to_path_buf(),
        message: e.to_string(),
    })?;
    notmuch::Database::create(db_path).map_err(|e| NotmuchDbError::Create {
        path: db_path.to_path_buf(),
        message: e.to_string(),
    })?;
    info!(db = %db_path.display(), "created mailbrus notmuch database");
    Ok(())
}

/// Write the mailbrus-managed notmuch config to `config_path`.
///
/// `db_path` is registered as `[database] path` — the single notmuch mail root.
/// All `account_maildir_roots` are expected to live under `db_path` (the
/// default `mail/<account-id>/` layout guarantees this); any root that does not
/// is logged as a warning, since notmuch can only index files beneath its mail
/// root. The configured roots are also recorded as comments for transparency.
///
/// The file is regenerated on every startup and overwrites any previous
/// contents, so it always reflects the current account list.
pub fn write_config(
    config_path: &Path,
    db_path: &Path,
    account_maildir_roots: &[PathBuf],
) -> Result<(), NotmuchDbError> {
    for root in account_maildir_roots {
        if !root.starts_with(db_path) {
            warn!(
                maildir = %root.display(),
                db = %db_path.display(),
                "account maildir root is outside the notmuch database root; it will not be indexed"
            );
        }
    }

    let mut body = String::new();
    body.push_str("# Managed by mailbrus — do not edit. Regenerated on every startup.\n");
    for root in account_maildir_roots {
        body.push_str(&format!("# account maildir: {}\n", root.display()));
    }
    body.push_str("[database]\n");
    body.push_str(&format!("path={}\n", db_path.display()));
    body.push_str("[new]\n");
    body.push_str("tags=\n");
    // Never index mailbrus's own bookkeeping files or git placeholders.
    body.push_str("ignore=.notmuch;notmuch.cfg;sync.db;.gitkeep\n");
    body.push_str("[search]\n");
    body.push_str("exclude_tags=deleted\n");
    body.push_str("[maildir]\n");
    body.push_str("synchronize_flags=true\n");

    if let Some(parent) = config_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| NotmuchDbError::WriteConfig {
            path: config_path.to_path_buf(),
            source: e,
        })?;
    }
    let mut f = std::fs::File::create(config_path).map_err(|e| NotmuchDbError::WriteConfig {
        path: config_path.to_path_buf(),
        source: e,
    })?;
    f.write_all(body.as_bytes())
        .map_err(|e| NotmuchDbError::WriteConfig {
            path: config_path.to_path_buf(),
            source: e,
        })?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp_dir(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!(
            "mailbrus-notmuchdb-{tag}-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn default_paths_are_under_mailbrus_data_dir() {
        // Both paths share the `mailbrus` data root; the config is a sibling of
        // the database root, never inside the system notmuch config.
        let db = default_db_path().unwrap();
        let cfg = default_config_path().unwrap();
        assert!(db.ends_with("mailbrus"), "db root: {}", db.display());
        assert_eq!(cfg, db.join("notmuch.cfg"));
    }

    #[test]
    fn ensure_initialized_creates_then_is_idempotent() {
        let dir = tmp_dir("init");
        let db = dir.join("mailbrus");
        assert!(!db.join(".notmuch").exists());

        ensure_initialized(&db).unwrap();
        assert!(db.join(".notmuch").is_dir(), "first call creates .notmuch");

        // Second call must be a no-op and must not error on an existing DB.
        ensure_initialized(&db).unwrap();
        assert!(db.join(".notmuch").is_dir());

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn write_config_produces_valid_notmuch_config() {
        let dir = tmp_dir("cfg");
        let db = dir.join("mailbrus");
        let cfg = db.join("notmuch.cfg");
        let roots = vec![db.join("mail").join("work"), db.join("mail").join("home")];

        write_config(&cfg, &db, &roots).unwrap();
        let contents = std::fs::read_to_string(&cfg).unwrap();

        assert!(contents.contains("[database]"));
        assert!(contents.contains(&format!("path={}", db.display())));
        assert!(contents.contains("[new]"));
        assert!(contents.contains("# account maildir:"));

        // The generated config must be loadable by notmuch itself: create the DB
        // then open it through the config to confirm notmuch accepts the file.
        ensure_initialized(&db).unwrap();
        let opened = notmuch::Database::open_with_config(
            None::<&Path>,
            notmuch::DatabaseMode::ReadOnly,
            Some(&cfg),
            None,
        );
        assert!(opened.is_ok(), "notmuch rejected generated config: {opened:?}");

        std::fs::remove_dir_all(&dir).ok();
    }
}
