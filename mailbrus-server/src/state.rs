use crate::cli::LogLevel;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use mailbrus_core::config::AccountConfig;
use mailbrus_core::sync::SyncEngine;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tracing::info;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PushSubscription {
    pub id: String,
    pub account: String,
    pub endpoint: String,
    pub keys: serde_json::Value,
}

#[derive(Clone)]
pub struct AppState {
    pub push_subscriptions: Arc<Mutex<HashMap<String, PushSubscription>>>,
    pub vapid_public_key: Arc<String>,
    pub log_level: LogLevel,
    pub accounts: Arc<Vec<AccountConfig>>,
    pub sync_engine: Option<Arc<SyncEngine>>,
    pub notmuch_db_path: Option<PathBuf>,
}

impl AppState {
    pub fn new(
        log_level: LogLevel,
        accounts: Vec<AccountConfig>,
        sync_engine: Option<Arc<SyncEngine>>,
        notmuch_db_path: Option<PathBuf>,
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
            accounts: Arc::new(accounts),
            sync_engine,
            notmuch_db_path,
        }
    }
}
