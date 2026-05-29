//! Sync orchestration: registry of accounts, in-flight guard, SSE broadcast.

use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::Arc;

use serde::Serialize;
use thiserror::Error;
use tokio::sync::{broadcast, Mutex};
use tracing::{error, info};

use crate::config::AccountConfig;
use crate::sync::imap::{ImapSyncError, ImapWorker, NotmuchLock};
use crate::sync::state::{self};

const EVENT_CHANNEL_CAPACITY: usize = 64;

#[derive(Debug, Error)]
pub enum SyncError {
    #[error("unknown account: {0}")]
    UnknownAccount(String),
    #[error("sync already running for account `{0}`")]
    AlreadyRunning(String),
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SyncStatus {
    Running,
    Done,
    Error,
}

#[derive(Debug, Clone, Serialize)]
pub struct SyncEvent {
    pub account_id: String,
    pub mailbox: Option<String>,
    pub status: SyncStatus,
    pub fetched: u32,
    pub deleted: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

pub struct SyncEngine {
    accounts: HashMap<String, AccountConfig>,
    in_flight: Arc<Mutex<HashSet<String>>>,
    notmuch_db_path: PathBuf,
    notmuch_lock: NotmuchLock,
    state_db_path: PathBuf,
    events_tx: broadcast::Sender<SyncEvent>,
}

impl SyncEngine {
    pub fn new(
        accounts: &[AccountConfig],
        notmuch_db_path: PathBuf,
        state_db_path: Option<PathBuf>,
    ) -> Result<Self, ImapSyncError> {
        let mut registry = HashMap::new();
        for acc in accounts {
            registry.insert(acc.id.clone(), acc.clone());
        }
        let state_db_path = match state_db_path {
            Some(p) => p,
            None => state::default_path().map_err(ImapSyncError::State)?,
        };
        let (events_tx, _) = broadcast::channel(EVENT_CHANNEL_CAPACITY);
        Ok(Self {
            accounts: registry,
            in_flight: Arc::new(Mutex::new(HashSet::new())),
            notmuch_db_path,
            notmuch_lock: NotmuchLock::default(),
            state_db_path,
            events_tx,
        })
    }

    pub fn account_ids(&self) -> Vec<String> {
        let mut ids: Vec<String> = self.accounts.keys().cloned().collect();
        ids.sort();
        ids
    }

    pub fn accounts(&self) -> Vec<AccountConfig> {
        let mut v: Vec<AccountConfig> = self.accounts.values().cloned().collect();
        v.sort_by(|a, b| a.id.cmp(&b.id));
        v
    }

    pub fn subscribe(&self) -> broadcast::Receiver<SyncEvent> {
        self.events_tx.subscribe()
    }

    /// Trigger a background sync for every configured account.
    /// Returns immediately after spawning tasks.
    pub fn sync_all(self: &Arc<Self>) {
        for id in self.account_ids() {
            let engine = self.clone();
            tokio::spawn(async move {
                if let Err(e) = engine.sync_account(&id).await {
                    error!(account = %id, err = ?e, "sync_account failed to start");
                }
            });
        }
    }

    /// Trigger a sync for one account. Returns immediately after spawning
    /// the worker task. Returns an error synchronously if the account is
    /// unknown or already syncing.
    pub async fn sync_account(self: &Arc<Self>, id: &str) -> Result<(), SyncError> {
        let account = self
            .accounts
            .get(id)
            .cloned()
            .ok_or_else(|| SyncError::UnknownAccount(id.to_string()))?;

        {
            let mut in_flight = self.in_flight.lock().await;
            if in_flight.contains(id) {
                return Err(SyncError::AlreadyRunning(id.to_string()));
            }
            in_flight.insert(id.to_string());
        }

        let engine = self.clone();
        let id_owned = id.to_string();
        tokio::spawn(async move {
            engine.run_account_worker(account, id_owned).await;
        });

        Ok(())
    }

    async fn run_account_worker(self: Arc<Self>, account: AccountConfig, id: String) {
        let _ = self.events_tx.send(SyncEvent {
            account_id: id.clone(),
            mailbox: None,
            status: SyncStatus::Running,
            fetched: 0,
            deleted: 0,
            error: None,
        });

        let worker_result = ImapWorker::new(
            &account,
            self.notmuch_db_path.clone(),
            self.notmuch_lock.clone(),
            self.state_db_path.clone(),
        );

        let outcome = match worker_result {
            Ok(worker) => worker.sync().await,
            Err(e) => Err(e),
        };

        let final_event = match outcome {
            Ok(report) => {
                info!(
                    account = %id,
                    mailbox = %report.mailbox,
                    fetched = report.fetched,
                    deleted = report.deleted,
                    "sync done"
                );
                SyncEvent {
                    account_id: id.clone(),
                    mailbox: Some(report.mailbox),
                    status: SyncStatus::Done,
                    fetched: report.fetched,
                    deleted: report.deleted,
                    error: None,
                }
            }
            Err(e) => {
                error!(account = %id, err = ?e, "sync failed");
                SyncEvent {
                    account_id: id.clone(),
                    mailbox: None,
                    status: SyncStatus::Error,
                    fetched: 0,
                    deleted: 0,
                    error: Some(e.to_string()),
                }
            }
        };
        let _ = self.events_tx.send(final_event);

        let mut in_flight = self.in_flight.lock().await;
        in_flight.remove(&id);
    }

    pub fn is_running(&self, id: &str) -> bool {
        if let Ok(guard) = self.in_flight.try_lock() {
            guard.contains(id)
        } else {
            true
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{CredentialBackend, ImapConfig, ProtocolConfig};

    fn account(id: &str) -> AccountConfig {
        AccountConfig {
            id: id.to_string(),
            protocol: ProtocolConfig::Imap(ImapConfig {
                email: format!("{id}@example.com"),
                display_name: None,
                imap_host: "imap.example.com".to_string(),
                imap_port: 993,
                imap_tls: true,
                credential_backend: CredentialBackend::Keyring,
                credential_ref: format!("test-{id}"),
                maildir_root: None,
                pass_gpg_backend: None,
            }),
        }
    }

    fn tmp_dir() -> PathBuf {
        let d = std::env::temp_dir().join(format!(
            "mailbrus-engine-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    fn make_engine(ids: &[&str]) -> Arc<SyncEngine> {
        let accounts: Vec<AccountConfig> = ids.iter().map(|s| account(s)).collect();
        let dir = tmp_dir();
        let engine = SyncEngine::new(
            &accounts,
            dir.join("notmuch"),
            Some(dir.join("sync.db")),
        )
        .unwrap();
        Arc::new(engine)
    }

    #[tokio::test]
    async fn account_ids_sorted_and_registered() {
        let engine = make_engine(&["work", "personal", "alpha"]);
        let ids = engine.account_ids();
        assert_eq!(ids, vec!["alpha", "personal", "work"]);
    }

    #[tokio::test]
    async fn sync_account_unknown_returns_error() {
        let engine = make_engine(&["work"]);
        let result = engine.sync_account("nonexistent").await;
        assert!(matches!(result, Err(SyncError::UnknownAccount(_))));
    }

    #[tokio::test]
    async fn sync_account_concurrent_guard_returns_already_running() {
        // The worker will fail (no real IMAP), but the guard insertion happens before
        // the spawn, so a quick second call should hit AlreadyRunning.
        let engine = make_engine(&["work"]);
        // Pre-insert into in_flight to simulate an in-progress sync without actually
        // launching the worker (which would fail flakily depending on network).
        {
            let mut guard = engine.in_flight.lock().await;
            guard.insert("work".to_string());
        }
        let result = engine.sync_account("work").await;
        assert!(matches!(result, Err(SyncError::AlreadyRunning(_))));
    }

    #[tokio::test]
    async fn subscribe_returns_a_receiver() {
        let engine = make_engine(&["work"]);
        let _rx = engine.subscribe();
    }
}
