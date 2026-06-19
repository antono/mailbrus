use std::sync::OnceLock;

use thiserror::Error;
use tracing::debug;

use crate::config::{AccountConfig, CredentialBackend, ImapConfig};

#[derive(Debug, Error)]
pub enum CredentialError {
    #[error("no credential found for account `{account}` via {backend}")]
    NotFound { account: String, backend: &'static str },
    #[error("keyring error for account `{account}`: {source}")]
    Keyring {
        account: String,
        #[source]
        source: keyring::Error,
    },
    #[error("pass store error for account `{account}`: {message}")]
    Pass { account: String, message: String },
    #[error("account `{account}` has no IMAP protocol config")]
    UnsupportedProtocol { account: String },
    /// Returned when attempting to write a credential for the `pass` backend,
    /// which is read-only from the application.
    #[error("the pass credential backend is read-only; configure it manually")]
    PassReadOnly,
}

const DEFAULT_SERVICE_NAME: &str = "mailbrus";

static SERVICE_INIT: OnceLock<()> = OnceLock::new();

fn ensure_global_service_name() {
    SERVICE_INIT.get_or_init(|| {
        keyring::set_global_service_name(DEFAULT_SERVICE_NAME);
    });
}

/// Store the secret for a new account and return the `credential_ref` to persist in the config.
///
/// - `Keyring`: writes the secret to the OS keyring under `account_id` (= the email).
///   Returns `account_id` as the `credential_ref`.
/// - `Plain`: the secret IS the `credential_ref`; nothing external is written.
///   Returns `secret` as the `credential_ref`.
/// - `Pass`: read-only from the application; returns `Err(PassReadOnly)`.
pub async fn write(
    account_id: &str,
    backend: CredentialBackend,
    secret: &str,
) -> Result<String, CredentialError> {
    ensure_global_service_name();
    match backend {
        CredentialBackend::Keyring => {
            let entry =
                keyring::KeyringEntry::try_new(account_id).map_err(|source| {
                    CredentialError::Keyring { account: account_id.to_string(), source }
                })?;
            entry.set_secret(secret).await.map_err(|source| CredentialError::Keyring {
                account: account_id.to_string(),
                source,
            })?;
            debug!(account = account_id, "stored keyring credential");
            Ok(account_id.to_string())
        }
        CredentialBackend::Plain => {
            // For `plain`, the secret is stored inline as `credential_ref`.
            Ok(secret.to_string())
        }
        CredentialBackend::Pass => Err(CredentialError::PassReadOnly),
    }
}

/// Resolve the plaintext secret for an account.
pub async fn resolve(config: &AccountConfig) -> Result<String, CredentialError> {
    let imap = config.imap().ok_or_else(|| CredentialError::UnsupportedProtocol {
        account: config.id.clone(),
    })?;

    match imap.credential_backend {
        CredentialBackend::Keyring => resolve_keyring(&config.id, imap).await,
        CredentialBackend::Pass => resolve_pass(&config.id, imap),
        CredentialBackend::Plain => Ok(imap.credential_ref.clone()),
    }
}

async fn resolve_keyring(account: &str, imap: &ImapConfig) -> Result<String, CredentialError> {
    ensure_global_service_name();

    let entry = keyring::KeyringEntry::try_new(&imap.credential_ref).map_err(|e| {
        CredentialError::Keyring { account: account.to_string(), source: e }
    })?;

    match entry.find_secret().await {
        Ok(Some(secret)) => {
            debug!(account, key = %imap.credential_ref, "resolved keyring credential");
            Ok(secret)
        }
        Ok(None) => Err(CredentialError::NotFound {
            account: account.to_string(),
            backend: "keyring",
        }),
        Err(e) => Err(CredentialError::Keyring { account: account.to_string(), source: e }),
    }
}

fn resolve_pass(account: &str, imap: &ImapConfig) -> Result<String, CredentialError> {
    use prs_lib::crypto::IsContext;

    let store_root = std::env::var("PASSWORD_STORE_DIR")
        .unwrap_or_else(|_| prs_lib::STORE_DEFAULT_ROOT.to_string());

    let store = prs_lib::Store::open(&store_root).map_err(|e| CredentialError::Pass {
        account: account.to_string(),
        message: format!("open store at {store_root}: {e}"),
    })?;

    let secret = match store.find(Some(imap.credential_ref.clone())) {
        prs_lib::store::FindSecret::Exact(s) => s,
        prs_lib::store::FindSecret::Many(matches) if matches.is_empty() => {
            return Err(CredentialError::NotFound {
                account: account.to_string(),
                backend: "pass",
            });
        }
        prs_lib::store::FindSecret::Many(_) => {
            return Err(CredentialError::Pass {
                account: account.to_string(),
                message: format!("ambiguous match for `{}`", imap.credential_ref),
            });
        }
    };

    let config = prs_lib::crypto::Config {
        proto: prs_lib::crypto::Proto::Gpg,
        gpg_tty: false,
        verbose: false,
    };
    let mut context =
        prs_lib::crypto::context(&config).map_err(|e| CredentialError::Pass {
            account: account.to_string(),
            message: format!("init gpg context: {e}"),
        })?;

    let plaintext = context.decrypt_file(&secret.path).map_err(|e| CredentialError::Pass {
        account: account.to_string(),
        message: format!("decrypt {}: {e}", secret.path.display()),
    })?;

    let first = plaintext.first_line().map_err(|e| CredentialError::Pass {
        account: account.to_string(),
        message: format!("read first line: {e}"),
    })?;
    let s = first.unsecure_to_str().map_err(|e| CredentialError::Pass {
        account: account.to_string(),
        message: format!("utf8 first line: {e}"),
    })?;

    debug!(account, key = %imap.credential_ref, "resolved pass credential");
    Ok(s.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{AccountConfig, CredentialBackend, ImapConfig, ProtocolConfig};

    fn account(backend: CredentialBackend, credential_ref: &str) -> AccountConfig {
        AccountConfig {
            id: "test".to_string(),
            protocol: ProtocolConfig::Imap(ImapConfig {
                email: "test@example.com".to_string(),
                display_name: None,
                imap_host: "imap.example.com".to_string(),
                imap_port: 993,
                imap_tls: true,
                credential_backend: backend,
                credential_ref: credential_ref.to_string(),
                maildir_root: None,
                pass_gpg_backend: None,
                smtp_host: None,
                smtp_port: None,
                smtp_starttls: None,
                signature: None,
            }),
        }
    }

    #[tokio::test]
    async fn keyring_missing_entry_returns_not_found() {
        // Use a unique key that should not exist in any test runner's keyring.
        let key = format!(
            "mailbrus-test-nonexistent-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        );
        let acc = account(CredentialBackend::Keyring, &key);

        match resolve(&acc).await {
            Err(CredentialError::NotFound { backend, .. }) => {
                assert_eq!(backend, "keyring");
            }
            // Some CI environments have no secret service at all; that's a
            // Keyring error rather than NotFound. Accept both as evidence the
            // path runs.
            Err(CredentialError::Keyring { .. }) => {}
            other => panic!("expected NotFound or Keyring error, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn plain_write_and_resolve_round_trips() {
        let cred_ref = write("plain@test.local", CredentialBackend::Plain, "s3cr3t").await.unwrap();
        assert_eq!(cred_ref, "s3cr3t", "plain backend returns the secret as credential_ref");

        // Build an account that would be loaded from the on-disk TOML after write.
        let acc = account(CredentialBackend::Plain, &cred_ref);
        let resolved = resolve(&acc).await.expect("plain resolve must not fail");
        assert_eq!(resolved, "s3cr3t");
    }

    #[tokio::test]
    async fn keyring_write_and_resolve_round_trips() {
        let account_id = format!(
            "mailbrus-test-rt-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        );

        let result = write(&account_id, CredentialBackend::Keyring, "hunter2").await;
        match result {
            // No secret service available in this environment — skip gracefully.
            Err(CredentialError::Keyring { .. }) => return,
            Err(e) => panic!("unexpected write error: {e}"),
            Ok(cred_ref) => {
                assert_eq!(cred_ref, account_id, "keyring backend returns account_id as credential_ref");

                let acc = account(CredentialBackend::Keyring, &cred_ref);
                let resolved = resolve(&acc).await.expect("resolve after write must succeed");
                assert_eq!(resolved, "hunter2");

                // Clean up — best-effort; a leaked test entry is not critical.
                let entry = keyring::KeyringEntry::try_new(&cred_ref).ok();
                if let Some(e) = entry {
                    let _ = e.delete_secret().await;
                }
            }
        }
    }

    #[test]
    fn pass_missing_store_returns_error() {
        // Point at a directory that almost certainly does not exist as a pass store.
        let tmp = std::env::temp_dir().join(format!(
            "mailbrus-test-no-store-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        // Safety: tests run single-threaded for this assertion only when no other
        // pass-backed test runs concurrently; isolated by unique path so safe in practice.
        unsafe {
            std::env::set_var("PASSWORD_STORE_DIR", &tmp);
        }

        let acc = account(CredentialBackend::Pass, "anything/here");
        let result = resolve_pass(&acc.id, acc.imap().unwrap());

        assert!(result.is_err(), "missing pass store must error");

        unsafe {
            std::env::remove_var("PASSWORD_STORE_DIR");
        }
    }
}
