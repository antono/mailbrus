use std::collections::HashMap;
use std::path::{Path, PathBuf};

use serde::Deserialize;
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
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum CredentialBackend {
    Keyring,
    Pass,
    /// Test/local backend: the `credential_ref` itself is treated as the
    /// plaintext secret. Convenient for fixtures and offline development,
    /// NEVER for production accounts.
    Plain,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
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
}

#[derive(Deserialize)]
struct RawConfigFile {
    #[serde(default)]
    accounts: HashMap<String, toml::Value>,
}

#[derive(Deserialize)]
struct RawImap {
    #[allow(dead_code)]
    protocol: Option<String>,
    email: Option<String>,
    display_name: Option<String>,
    imap_host: Option<String>,
    imap_port: Option<u16>,
    imap_tls: Option<bool>,
    credential_backend: Option<CredentialBackend>,
    credential_ref: Option<String>,
    maildir_root: Option<PathBuf>,
    pass_gpg_backend: Option<PassGpgBackend>,
}

/// Load mailbrus account config.
///
/// If `path` is `Some`, that path is loaded. Otherwise the XDG default
/// `$XDG_CONFIG_HOME/mailbrus/config.toml` (typically `~/.config/mailbrus/config.toml`)
/// is used. If the resolved file does not exist, an empty list is returned and
/// a warning is logged.
pub fn load_config(path: Option<&Path>) -> Result<Vec<AccountConfig>, ConfigError> {
    let resolved = match path {
        Some(p) => p.to_path_buf(),
        None => default_config_path()?,
    };

    if !resolved.exists() {
        warn!(
            config_path = %resolved.display(),
            "no mailbrus config file found; no accounts configured"
        );
        return Ok(Vec::new());
    }

    let raw = std::fs::read_to_string(&resolved).map_err(|e| ConfigError::Io {
        path: resolved.clone(),
        source: e,
    })?;
    let file: RawConfigFile = toml::from_str(&raw).map_err(|e| ConfigError::Parse {
        path: resolved.clone(),
        source: e,
    })?;

    let mut accounts = Vec::new();
    for (id, value) in file.accounts {
        let protocol_name = value.get("protocol").and_then(|v| v.as_str());
        match protocol_name {
            Some("imap") => {
                let raw_imap: RawImap = value.try_into().map_err(|e| ConfigError::Parse {
                    path: resolved.clone(),
                    source: e,
                })?;
                let imap = build_imap(&id, raw_imap)?;
                accounts.push(AccountConfig { id, protocol: ProtocolConfig::Imap(imap) });
            }
            Some(other) => {
                warn!(account = %id, protocol = %other, "skipping account: unknown protocol");
            }
            None => {
                return Err(ConfigError::MissingField {
                    account: id,
                    field: "protocol".to_string(),
                });
            }
        }
    }

    accounts.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(accounts)
}

fn build_imap(id: &str, r: RawImap) -> Result<ImapConfig, ConfigError> {
    let missing = |field: &str| ConfigError::MissingField {
        account: id.to_string(),
        field: field.to_string(),
    };
    Ok(ImapConfig {
        email: r.email.ok_or_else(|| missing("email"))?,
        display_name: r.display_name,
        imap_host: r.imap_host.ok_or_else(|| missing("imap_host"))?,
        imap_port: r.imap_port.ok_or_else(|| missing("imap_port"))?,
        imap_tls: r.imap_tls.ok_or_else(|| missing("imap_tls"))?,
        credential_backend: r
            .credential_backend
            .ok_or_else(|| missing("credential_backend"))?,
        credential_ref: r.credential_ref.ok_or_else(|| missing("credential_ref"))?,
        maildir_root: r.maildir_root,
        pass_gpg_backend: r.pass_gpg_backend,
    })
}

fn default_config_path() -> Result<PathBuf, ConfigError> {
    dirs::config_dir()
        .ok_or(ConfigError::NoXdgConfig)
        .map(|d| d.join("mailbrus").join("config.toml"))
}

/// Default per-account maildir root under `$XDG_DATA_HOME/mailbrus/mail/<account-id>/`.
pub fn default_maildir_root(account_id: &str) -> Option<PathBuf> {
    dirs::data_dir().map(|d| d.join("mailbrus").join("mail").join(account_id))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn write_tmp(contents: &str) -> tempfile::NamedTempFile {
        let mut f = tempfile::NamedTempFile::new().unwrap();
        f.write_all(contents.as_bytes()).unwrap();
        f
    }

    #[test]
    fn load_valid_imap_account() {
        let f = write_tmp(
            r#"
[accounts.work]
protocol = "imap"
email = "me@work.com"
display_name = "Me (Work)"
imap_host = "imap.work.com"
imap_port = 993
imap_tls = true
credential_backend = "keyring"
credential_ref = "work-imap"
"#,
        );
        let accounts = load_config(Some(f.path())).unwrap();
        assert_eq!(accounts.len(), 1);
        let a = &accounts[0];
        assert_eq!(a.id, "work");
        let imap = a.imap().unwrap();
        assert_eq!(imap.email, "me@work.com");
        assert_eq!(imap.imap_host, "imap.work.com");
        assert_eq!(imap.imap_port, 993);
        assert!(imap.imap_tls);
        assert_eq!(imap.credential_backend, CredentialBackend::Keyring);
        assert_eq!(imap.credential_ref, "work-imap");
        assert_eq!(imap.display_name.as_deref(), Some("Me (Work)"));
    }

    #[test]
    fn load_missing_required_field_errors() {
        let f = write_tmp(
            r#"
[accounts.work]
protocol = "imap"
email = "me@work.com"
imap_port = 993
imap_tls = true
credential_backend = "keyring"
credential_ref = "work-imap"
"#,
        );
        let err = load_config(Some(f.path())).unwrap_err();
        match err {
            ConfigError::MissingField { account, field } => {
                assert_eq!(account, "work");
                assert_eq!(field, "imap_host");
            }
            other => panic!("expected MissingField, got {other:?}"),
        }
    }

    #[test]
    fn unknown_protocol_skipped() {
        let f = write_tmp(
            r#"
[accounts.future]
protocol = "jmap"
url = "https://jmap.example.com"

[accounts.work]
protocol = "imap"
email = "me@work.com"
imap_host = "imap.work.com"
imap_port = 993
imap_tls = true
credential_backend = "keyring"
credential_ref = "work-imap"
"#,
        );
        let accounts = load_config(Some(f.path())).unwrap();
        assert_eq!(accounts.len(), 1, "jmap account should be skipped");
        assert_eq!(accounts[0].id, "work");
    }

    #[test]
    fn absent_file_returns_empty() {
        let path = std::env::temp_dir().join(format!(
            "mailbrus-no-config-{}.toml",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        assert!(!path.exists());
        let accounts = load_config(Some(&path)).unwrap();
        assert!(accounts.is_empty());
    }

    #[test]
    fn pass_backend_with_gpg_backend() {
        let f = write_tmp(
            r#"
[accounts.work]
protocol = "imap"
email = "me@work.com"
imap_host = "imap.work.com"
imap_port = 993
imap_tls = true
credential_backend = "pass"
credential_ref = "mail/work"
pass_gpg_backend = "gpgme"
"#,
        );
        let accounts = load_config(Some(f.path())).unwrap();
        let imap = accounts[0].imap().unwrap();
        assert_eq!(imap.credential_backend, CredentialBackend::Pass);
        assert_eq!(imap.pass_gpg_backend, Some(PassGpgBackend::Gpgme));
    }

    #[test]
    fn malformed_toml_returns_parse_error() {
        let f = write_tmp("this is not valid = toml = file");
        let err = load_config(Some(f.path())).unwrap_err();
        assert!(matches!(err, ConfigError::Parse { .. }));
    }
}
