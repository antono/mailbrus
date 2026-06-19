use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use thiserror::Error;
use tracing::warn;

#[derive(Debug, Clone)]
pub struct AccountConfig {
    pub id: String,
    pub protocol: ProtocolConfig,
}

impl AccountConfig {
    pub fn imap(&self) -> Option<&ImapConfig> {
        match &self.protocol {
            ProtocolConfig::Imap(c) => Some(c),
        }
    }
}

#[derive(Debug, Clone)]
pub enum ProtocolConfig {
    Imap(ImapConfig),
}

#[derive(Debug, Clone)]
pub struct ImapConfig {
    pub email: String,
    pub display_name: Option<String>,
    pub imap_host: String,
    pub imap_port: u16,
    pub imap_tls: bool,
    pub credential_backend: CredentialBackend,
    pub credential_ref: String,
    pub maildir_root: Option<PathBuf>,
    pub pass_gpg_backend: Option<PassGpgBackend>,
    /// Optional SMTP submission host. When absent, outbound sending is not configured.
    pub smtp_host: Option<String>,
    /// SMTP port stored as-is; use `resolved_smtp_port()` to get the effective value.
    pub smtp_port: Option<u16>,
    /// STARTTLS flag stored as-is; use `resolved_smtp_starttls()` for the effective value.
    pub smtp_starttls: Option<bool>,
    /// Optional per-account signature applied with the `-- ` delimiter (RFC 3676 §4.3).
    pub signature: Option<String>,
}

impl ImapConfig {
    /// Resolved SMTP submission port; defaults to 587 if not explicitly set.
    pub fn resolved_smtp_port(&self) -> u16 {
        self.smtp_port.unwrap_or(587)
    }

    /// Whether STARTTLS is enabled for SMTP; defaults to true if not explicitly set.
    pub fn resolved_smtp_starttls(&self) -> bool {
        self.smtp_starttls.unwrap_or(true)
    }
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum CredentialBackend {
    Keyring,
    Pass,
    /// The `credential_ref` field itself is the plaintext secret. Convenient
    /// for fixtures and offline development — never use for production accounts.
    Plain,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum PassGpgBackend {
    GnupgBin,
    Gpgme,
    Rpgpie,
}

#[derive(Debug, Error)]
pub enum ConfigError {
    #[error("config file {path}: invalid TOML: {source}")]
    Parse {
        path: PathBuf,
        #[source]
        source: toml::de::Error,
    },
    #[error("account `{account}` is missing required field `{field}`")]
    MissingField { account: String, field: String },
    #[error("cannot resolve XDG config directory")]
    NoXdgConfig,
    #[error("cannot read {path}: {source}")]
    Io {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    /// Returned by `write_account` when the target file already exists.
    #[error("account file already exists: {path}")]
    AlreadyExists { path: PathBuf },
    #[error("cannot write account file {path}: {source}")]
    WriteIo {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error("cannot serialize account to TOML: {source}")]
    Serialize {
        #[source]
        source: toml::ser::Error,
    },
}

/// Per-account flat TOML file — fields at the top level, no `[accounts.<id>]` wrapper.
/// The filename stem (email address) is the account id; the `email` field is optional
/// and defaults to the filename stem when absent.
#[derive(Debug, Deserialize, Serialize)]
struct RawAccountFile {
    #[serde(skip_serializing_if = "Option::is_none")]
    email: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    display_name: Option<String>,
    imap_host: Option<String>,
    imap_port: Option<u16>,
    imap_tls: Option<bool>,
    credential_backend: Option<CredentialBackend>,
    #[serde(skip_serializing_if = "Option::is_none")]
    credential_ref: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    maildir_root: Option<PathBuf>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pass_gpg_backend: Option<PassGpgBackend>,
    #[serde(skip_serializing_if = "Option::is_none")]
    smtp_host: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    smtp_port: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    smtp_starttls: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    signature: Option<String>,
}

/// Load mailbrus account configs by scanning the `accounts/` subdirectory.
///
/// If `base_dir` is `Some`, reads from `<base_dir>/accounts/*.toml`.
/// Otherwise uses `$XDG_CONFIG_HOME/mailbrus/accounts/` (fallback `~/.config/mailbrus/accounts/`).
///
/// An absent or empty `accounts/` directory returns an empty list with a warning.
/// Malformed files are skipped (warning logged with the filename) and loading continues.
pub fn load_config(base_dir: Option<&Path>) -> Result<Vec<AccountConfig>, ConfigError> {
    let accounts_dir = match base_dir {
        Some(p) => p.join("accounts"),
        None => default_accounts_dir()?,
    };

    if !accounts_dir.exists() {
        warn!(
            accounts_dir = %accounts_dir.display(),
            "accounts directory not found; no accounts configured"
        );
        return Ok(Vec::new());
    }

    let entries = match fs::read_dir(&accounts_dir) {
        Ok(e) => e,
        Err(source) => return Err(ConfigError::Io { path: accounts_dir, source }),
    };

    let mut accounts = Vec::new();
    for entry_result in entries {
        let entry = match entry_result {
            Ok(e) => e,
            Err(e) => {
                warn!(accounts_dir = %accounts_dir.display(), "error reading directory entry: {e}");
                continue;
            }
        };

        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("toml") {
            continue;
        }

        // Filename stem = account id = email address.
        let id = match path.file_stem().and_then(|s| s.to_str()) {
            Some(s) => s.to_string(),
            None => {
                warn!(path = %path.display(), "skipping account file: cannot determine id from filename");
                continue;
            }
        };

        let raw_text = match fs::read_to_string(&path) {
            Ok(s) => s,
            Err(e) => {
                warn!(path = %path.display(), "skipping account file: cannot read: {e}");
                continue;
            }
        };

        let raw: RawAccountFile = match toml::from_str(&raw_text) {
            Ok(r) => r,
            Err(e) => {
                warn!(path = %path.display(), "skipping account file: invalid TOML: {e}");
                continue;
            }
        };

        match build_imap(&id, raw) {
            Ok(imap) => accounts.push(AccountConfig { id, protocol: ProtocolConfig::Imap(imap) }),
            Err(e) => {
                warn!(path = %path.display(), "skipping account file: {e}");
            }
        }
    }

    accounts.sort_by(|a, b| a.id.cmp(&b.id));

    if accounts.is_empty() {
        warn!(
            accounts_dir = %accounts_dir.display(),
            "no valid account files found; no accounts configured"
        );
    }

    Ok(accounts)
}

/// Write a new account as `accounts/<id>.toml` under `base_dir`, atomically.
///
/// Creates the `accounts/` directory if it doesn't exist.
/// Returns `ConfigError::AlreadyExists` if the target file already exists.
pub fn write_account(base_dir: &Path, imap: &ImapConfig, id: &str) -> Result<(), ConfigError> {
    let accounts_dir = base_dir.join("accounts");
    fs::create_dir_all(&accounts_dir).map_err(|source| ConfigError::WriteIo {
        path: accounts_dir.clone(),
        source,
    })?;

    let dest = accounts_dir.join(format!("{id}.toml"));
    if dest.exists() {
        return Err(ConfigError::AlreadyExists { path: dest });
    }

    let raw = imap_to_raw(imap);
    let toml_str = toml::to_string_pretty(&raw).map_err(|source| ConfigError::Serialize { source })?;

    // Write to a temp file in the same dir, fsync, then rename atomically.
    let tmp_path = accounts_dir.join(format!(".{id}.toml.tmp"));
    {
        use std::io::Write;
        let mut f = fs::File::create(&tmp_path).map_err(|source| ConfigError::WriteIo {
            path: tmp_path.clone(),
            source,
        })?;
        f.write_all(toml_str.as_bytes()).map_err(|source| ConfigError::WriteIo {
            path: tmp_path.clone(),
            source,
        })?;
        f.sync_all().map_err(|source| ConfigError::WriteIo {
            path: tmp_path.clone(),
            source,
        })?;
    }

    fs::rename(&tmp_path, &dest).map_err(|source| ConfigError::WriteIo { path: dest, source })?;

    Ok(())
}

/// Apply a per-account signature to a plain-text body using the `-- ` delimiter (RFC 3676 §4.3).
///
/// Appends `\r\n-- \r\n<signature>` when a non-empty signature is present.
/// Returns the body unchanged when `signature` is `None` or empty.
pub fn apply_signature(body: &str, signature: Option<&str>) -> String {
    match signature {
        None | Some("") => body.to_string(),
        Some(sig) => format!("{body}\r\n-- \r\n{sig}"),
    }
}

fn imap_to_raw(imap: &ImapConfig) -> RawAccountFile {
    RawAccountFile {
        email: Some(imap.email.clone()),
        display_name: imap.display_name.clone(),
        imap_host: Some(imap.imap_host.clone()),
        imap_port: Some(imap.imap_port),
        imap_tls: Some(imap.imap_tls),
        credential_backend: Some(imap.credential_backend),
        credential_ref: Some(imap.credential_ref.clone()),
        maildir_root: imap.maildir_root.clone(),
        pass_gpg_backend: imap.pass_gpg_backend,
        smtp_host: imap.smtp_host.clone(),
        smtp_port: imap.smtp_port,
        smtp_starttls: imap.smtp_starttls,
        signature: imap.signature.clone(),
    }
}

fn build_imap(id: &str, r: RawAccountFile) -> Result<ImapConfig, ConfigError> {
    let missing = |field: &str| ConfigError::MissingField {
        account: id.to_string(),
        field: field.to_string(),
    };
    // email defaults to the filename stem (= id = email address) when absent in the file.
    let email = r.email.unwrap_or_else(|| id.to_string());
    // credential_ref defaults to the email — stable and collision-free for keyring lookups.
    let credential_ref = r.credential_ref.unwrap_or_else(|| email.clone());

    Ok(ImapConfig {
        email,
        display_name: r.display_name,
        imap_host: r.imap_host.ok_or_else(|| missing("imap_host"))?,
        imap_port: r.imap_port.ok_or_else(|| missing("imap_port"))?,
        imap_tls: r.imap_tls.ok_or_else(|| missing("imap_tls"))?,
        credential_backend: r.credential_backend.ok_or_else(|| missing("credential_backend"))?,
        credential_ref,
        maildir_root: r.maildir_root,
        pass_gpg_backend: r.pass_gpg_backend,
        smtp_host: r.smtp_host,
        smtp_port: r.smtp_port,
        smtp_starttls: r.smtp_starttls,
        signature: r.signature,
    })
}

fn default_accounts_dir() -> Result<PathBuf, ConfigError> {
    dirs::config_dir()
        .ok_or(ConfigError::NoXdgConfig)
        .map(|d| d.join("mailbrus").join("accounts"))
}

/// Default per-account maildir root: `$XDG_DATA_HOME/mailbrus/mail/<email>/`.
pub fn default_maildir_root(account_id: &str) -> Option<PathBuf> {
    dirs::data_dir().map(|d| d.join("mailbrus").join("mail").join(account_id))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn make_accounts_dir() -> tempfile::TempDir {
        let tmp = tempfile::tempdir().unwrap();
        fs::create_dir_all(tmp.path().join("accounts")).unwrap();
        tmp
    }

    fn write_account_file(base: &Path, email: &str, contents: &str) {
        let path = base.join("accounts").join(format!("{email}.toml"));
        let mut f = fs::File::create(path).unwrap();
        f.write_all(contents.as_bytes()).unwrap();
    }

    fn minimal_imap(email: &str) -> ImapConfig {
        ImapConfig {
            email: email.to_string(),
            display_name: None,
            imap_host: "imap.example.com".to_string(),
            imap_port: 993,
            imap_tls: true,
            credential_backend: CredentialBackend::Plain,
            credential_ref: "secret".to_string(),
            maildir_root: None,
            pass_gpg_backend: None,
            smtp_host: None,
            smtp_port: None,
            smtp_starttls: None,
            signature: None,
        }
    }

    #[test]
    fn scan_loads_n_accounts() {
        let tmp = make_accounts_dir();
        write_account_file(tmp.path(), "alice@example.com", r#"
imap_host = "imap.example.com"
imap_port = 993
imap_tls = true
credential_backend = "keyring"
"#);
        write_account_file(tmp.path(), "bob@example.com", r#"
imap_host = "imap.example.com"
imap_port = 993
imap_tls = true
credential_backend = "plain"
credential_ref = "bob-secret"
"#);
        let accounts = load_config(Some(tmp.path())).unwrap();
        assert_eq!(accounts.len(), 2);
        assert_eq!(accounts[0].id, "alice@example.com");
        assert_eq!(accounts[1].id, "bob@example.com");
    }

    #[test]
    fn id_equals_filename_stem() {
        let tmp = make_accounts_dir();
        write_account_file(tmp.path(), "me@work.com", r#"
imap_host = "imap.work.com"
imap_port = 993
imap_tls = true
credential_backend = "keyring"
"#);
        let accounts = load_config(Some(tmp.path())).unwrap();
        assert_eq!(accounts.len(), 1);
        let a = &accounts[0];
        assert_eq!(a.id, "me@work.com");
        let imap = a.imap().unwrap();
        assert_eq!(imap.email, "me@work.com"); // defaults to id
    }

    #[test]
    fn malformed_file_skipped_rest_loaded() {
        let tmp = make_accounts_dir();
        write_account_file(tmp.path(), "bad@example.com", "this is not valid = toml = file");
        write_account_file(tmp.path(), "good@example.com", r#"
imap_host = "imap.example.com"
imap_port = 993
imap_tls = true
credential_backend = "keyring"
"#);
        let accounts = load_config(Some(tmp.path())).unwrap();
        assert_eq!(accounts.len(), 1);
        assert_eq!(accounts[0].id, "good@example.com");
    }

    #[test]
    fn empty_dir_returns_empty() {
        let tmp = make_accounts_dir();
        let accounts = load_config(Some(tmp.path())).unwrap();
        assert!(accounts.is_empty());
    }

    #[test]
    fn absent_dir_returns_empty() {
        let tmp = tempfile::tempdir().unwrap();
        // No accounts/ subdirectory created.
        let accounts = load_config(Some(tmp.path())).unwrap();
        assert!(accounts.is_empty());
    }

    #[test]
    fn smtp_defaults_applied() {
        let tmp = make_accounts_dir();
        write_account_file(tmp.path(), "me@example.com", r#"
imap_host = "imap.example.com"
imap_port = 993
imap_tls = true
credential_backend = "keyring"
smtp_host = "smtp.example.com"
"#);
        let accounts = load_config(Some(tmp.path())).unwrap();
        let imap = accounts[0].imap().unwrap();
        assert_eq!(imap.smtp_host.as_deref(), Some("smtp.example.com"));
        assert_eq!(imap.smtp_port, None); // not explicitly set
        assert_eq!(imap.smtp_starttls, None); // not explicitly set
        assert_eq!(imap.resolved_smtp_port(), 587);
        assert!(imap.resolved_smtp_starttls());
    }

    #[test]
    fn signature_parsed_verbatim() {
        let tmp = make_accounts_dir();
        write_account_file(tmp.path(), "me@example.com", r#"
imap_host = "imap.example.com"
imap_port = 993
imap_tls = true
credential_backend = "keyring"
signature = "Best,\nAlice"
"#);
        let accounts = load_config(Some(tmp.path())).unwrap();
        let imap = accounts[0].imap().unwrap();
        assert_eq!(imap.signature.as_deref(), Some("Best,\nAlice"));
    }

    #[test]
    fn write_account_round_trips() {
        let tmp = tempfile::tempdir().unwrap();
        let imap = ImapConfig {
            smtp_host: Some("smtp.example.com".to_string()),
            smtp_port: Some(587),
            smtp_starttls: Some(true),
            signature: Some("Cheers,\nTest".to_string()),
            ..minimal_imap("test@example.com")
        };

        write_account(tmp.path(), &imap, "test@example.com").unwrap();

        let accounts = load_config(Some(tmp.path())).unwrap();
        assert_eq!(accounts.len(), 1);
        let loaded = accounts[0].imap().unwrap();
        assert_eq!(loaded.email, "test@example.com");
        assert_eq!(loaded.imap_host, "imap.example.com");
        assert_eq!(loaded.smtp_host.as_deref(), Some("smtp.example.com"));
        assert_eq!(loaded.signature.as_deref(), Some("Cheers,\nTest"));
    }

    #[test]
    fn write_account_refuses_overwrite() {
        let tmp = tempfile::tempdir().unwrap();
        let imap = minimal_imap("test@example.com");

        write_account(tmp.path(), &imap, "test@example.com").unwrap();
        let result = write_account(tmp.path(), &imap, "test@example.com");
        assert!(matches!(result, Err(ConfigError::AlreadyExists { .. })));
    }

    #[test]
    fn apply_signature_with_delimiter() {
        let body = "Hello, world!";
        let result = apply_signature(body, Some("Best,\nAlice"));
        assert_eq!(result, "Hello, world!\r\n-- \r\nBest,\nAlice");
        // Delimiter must be exactly dash-dash-space.
        assert!(result.contains("\r\n-- \r\n"));
    }

    #[test]
    fn apply_signature_none_returns_body_unchanged() {
        assert_eq!(apply_signature("Hi", None), "Hi");
        assert_eq!(apply_signature("Hi", Some("")), "Hi");
    }
}
