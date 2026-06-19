use crate::cli::LogLevel;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use mailbrus_core::config::{AccountConfig, load_config};
use mailbrus_core::notmuch_db;
use mailbrus_core::sync::SyncEngine;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tracing::{info, warn};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PushSubscription {
    pub id: String,
    pub account: String,
    pub endpoint: String,
    pub keys: serde_json::Value,
}

/// Shared server state. All fields are cheaply clonable.
///
/// `accounts` and `sync_engine` are wrapped in `Arc<Mutex<Arc<...>>>` so they
/// can be atomically swapped by `reload_accounts()` without restarting the server.
#[derive(Clone)]
pub struct AppState {
    pub push_subscriptions: Arc<Mutex<HashMap<String, PushSubscription>>>,
    pub vapid_public_key: Arc<String>,
    pub log_level: LogLevel,
    accounts: Arc<Mutex<Arc<Vec<AccountConfig>>>>,
    sync_engine: Arc<Mutex<Option<Arc<SyncEngine>>>>,
    pub notmuch_db_path: Option<PathBuf>,
    /// Base config directory used for `load_config` and `reload_accounts`.
    pub config_base_dir: Option<PathBuf>,
}

impl AppState {
    pub fn new(
        log_level: LogLevel,
        accounts: Vec<AccountConfig>,
        sync_engine: Option<Arc<SyncEngine>>,
        notmuch_db_path: Option<PathBuf>,
        config_base_dir: Option<PathBuf>,
    ) -> Self {
        let vapid_public_key = std::env::var("VAPID_PUBLIC_KEY").unwrap_or_else(|_| {
            let raw: Vec<u8> = (0..65).map(|i| i as u8).collect();
            URL_SAFE_NO_PAD.encode(&raw)
        });
        info!("[pwa] VAPID public key ready");
        Self {
            push_subscriptions: Arc::new(Mutex::new(HashMap::new())),
            vapid_public_key: Arc::new(vapid_public_key),
            log_level,
            accounts: Arc::new(Mutex::new(Arc::new(accounts))),
            sync_engine: Arc::new(Mutex::new(sync_engine)),
            notmuch_db_path,
            config_base_dir,
        }
    }

    /// Returns a snapshot of the current account list. Cheap — only clones the inner `Arc`.
    pub fn accounts(&self) -> Arc<Vec<AccountConfig>> {
        self.accounts.lock().unwrap().clone()
    }

    /// Returns the current sync engine, if any. Cheap — only clones the inner `Arc`.
    pub fn sync_engine(&self) -> Option<Arc<SyncEngine>> {
        self.sync_engine.lock().unwrap().clone()
    }

    /// Re-run startup wiring and atomically swap the account list and sync engine.
    ///
    /// Loads accounts from the config dir, re-registers maildir roots in notmuch,
    /// rebuilds the `SyncEngine`, and swaps both fields atomically. The common
    /// case is the 0→1 transition after an account is first created.
    pub fn reload_accounts(&self) {
        let new_accounts = match load_config(self.config_base_dir.as_deref()) {
            Ok(a) => {
                info!("[reload] loaded {} account(s)", a.len());
                a
            }
            Err(e) => {
                warn!("[reload] failed to load config: {} — keeping old accounts", e);
                return;
            }
        };

        // Re-register maildir roots in the notmuch config.
        if let Some(db_path) = &self.notmuch_db_path {
            match notmuch_db::default_config_path() {
                Ok(cfg_path) => {
                    let maildir_roots: Vec<PathBuf> = new_accounts
                        .iter()
                        .map(|a| {
                            a.imap()
                                .and_then(|i| i.maildir_root.clone())
                                .or_else(|| mailbrus_core::config::default_maildir_root(&a.id))
                                .unwrap_or_else(|| db_path.join("mail").join(&a.id))
                        })
                        .collect();
                    if let Err(e) =
                        notmuch_db::write_config(&cfg_path, db_path, &maildir_roots)
                    {
                        warn!("[reload] failed to write notmuch config: {e}");
                    }
                }
                Err(e) => warn!("[reload] cannot resolve notmuch config path: {e}"),
            }
        }

        let new_engine = if new_accounts.is_empty() {
            warn!("[reload] no accounts; sync engine disabled");
            None
        } else {
            match SyncEngine::new(&new_accounts, None) {
                Ok(engine) => {
                    info!("[reload] sync engine rebuilt");
                    Some(Arc::new(engine))
                }
                Err(e) => {
                    warn!("[reload] failed to build sync engine: {e} — keeping old engine");
                    return;
                }
            }
        };

        // Atomically swap both fields.
        *self.accounts.lock().unwrap() = Arc::new(new_accounts);
        *self.sync_engine.lock().unwrap() = new_engine;
        info!("[reload] accounts and sync engine swapped");
    }
}
