//! IMAP sync worker.
//!
//! Connects to a configured IMAP account, performs delta sync via CONDSTORE
//! (with full-UID-scan fallback), writes new messages to the account's maildir,
//! indexes them in notmuch, and applies the `account:<id>` tag.
//!
//! Bypasses `email-lib`'s high-level `ImapClient` wrapper to get direct access
//! to the underlying `imap-client` Client — needed for `FetchModifier::ChangedSince`.

use std::collections::HashSet;
use std::num::{NonZeroU32, NonZeroU64};
use std::path::{Path, PathBuf};
use std::sync::Arc;

use imap_client::client::tokio::Client;
use imap_client::imap_next::imap_types::{
    command::FetchModifier,
    core::Vec1,
    fetch::{MacroOrMessageDataItemNames, MessageDataItem, MessageDataItemName},
    flag::{Flag, FlagFetch},
    search::SearchKey,
    sequence::SequenceSet,
    ToStatic,
};
use thiserror::Error;
use tokio::sync::{broadcast, Mutex};
use tracing::{debug, info, instrument, warn};

use crate::config::{AccountConfig, CredentialBackend, ImapConfig, ProtocolConfig};
use crate::credentials::{self, CredentialError};
use crate::sync::engine::{BroadcastEvent, IndexEvent, SyncStatus};
use crate::sync::state::{ImapMailboxState, SyncStateDb, SyncStateError};

const DEFAULT_MAILBOX: &str = "INBOX";

/// Number of message bodies fetched (and then written + indexed) per batch.
/// Bounds memory and lets progress stream during a large initial sync; each
/// batch is indexed and checkpointed before the next is fetched.
const FETCH_BATCH_SIZE: usize = 50;

#[derive(Debug, Error)]
pub enum ImapSyncError {
    #[error("account `{0}` has no IMAP protocol config")]
    NotImap(String),
    #[error("connect to {host}:{port}: {message}")]
    Connect { host: String, port: u16, message: String },
    #[error("authenticate as {login}: {message}")]
    Auth { login: String, message: String },
    #[error("select mailbox {mailbox}: {message}")]
    Select { mailbox: String, message: String },
    #[error("fetch from mailbox {mailbox}: {message}")]
    Fetch { mailbox: String, message: String },
    #[error("write maildir file {path}: {source}")]
    MaildirIo {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error("notmuch error: {0}")]
    Notmuch(String),
    #[error("credential resolution failed: {0}")]
    Credential(#[from] CredentialError),
    #[error("sync state DB error: {0}")]
    State(#[from] SyncStateError),
}

/// Summary returned by `ImapWorker::sync()`.
#[derive(Debug, Clone, Default)]
pub struct SyncReport {
    pub account_id: String,
    pub mailbox: String,
    pub fetched: u32,
    pub deleted: u32,
    pub used_condstore: bool,
    pub uid_validity: u32,
    pub highest_modseq: Option<u64>,
}

/// Notmuch lock — shared across workers to avoid concurrent ReadWrite opens.
#[derive(Clone, Default)]
pub struct NotmuchLock(pub Arc<Mutex<()>>);

/// A milestone emitted during [`ImapWorker::sync`] when a progress sink is
/// attached via [`ImapWorker::with_progress`]. Used by `mailbrus-cli` to stream
/// live progress; ignored (never produced) when no sink is set.
#[derive(Debug, Clone)]
pub enum SyncProgress {
    /// Resolving the account password. `reference` is the store key for
    /// `keyring`/`pass`; it is `None` for `plain` (where the reference *is* the
    /// secret). The resolved password is never carried in any variant.
    ResolvingCredentials { backend: &'static str, reference: Option<String> },
    CredentialsResolved { backend: &'static str },
    Connecting { host: String, port: u16 },
    Authenticated,
    MailboxSelected { mailbox: String, uid_validity: u32 },
    NewMessages { count: usize },
    /// About to issue a FETCH for the next batch of `count` message bodies.
    FetchingBatch { count: usize },
    /// The batch's `count` message bodies have arrived.
    BatchFetched { count: usize },
    MessageFetched { uid: u32 },
    MessageStored { uid: u32, path: PathBuf },
    MessageFailed { uid: Option<u32>, reason: String },
    MessageDeleted { uid: u32 },
    IndexingStarted { count: usize },
    /// `indexed` of `total` messages indexed so far.
    IndexingProgress { indexed: usize, total: usize },
    IndexingFinished { indexed: usize },
}

/// A callback invoked synchronously for each [`SyncProgress`] milestone.
pub type ProgressSink = Arc<dyn Fn(SyncProgress) + Send + Sync>;

pub struct ImapWorker {
    account_id: String,
    imap: ImapConfig,
    maildir_root: PathBuf,
    notmuch_db_path: PathBuf,
    notmuch_lock: NotmuchLock,
    state_db_path: PathBuf,
    mailbox: String,
    events_tx: Option<broadcast::Sender<BroadcastEvent>>,
    progress: Option<ProgressSink>,
}

impl ImapWorker {
    pub fn new(
        account: &AccountConfig,
        notmuch_db_path: PathBuf,
        notmuch_lock: NotmuchLock,
        state_db_path: PathBuf,
    ) -> Result<Self, ImapSyncError> {
        let imap = match &account.protocol {
            ProtocolConfig::Imap(c) => c.clone(),
        };
        let maildir_root = imap.maildir_root.clone().or_else(|| {
            crate::config::default_maildir_root(&account.id)
        }).unwrap_or_else(|| PathBuf::from("./mail").join(&account.id));

        Ok(Self {
            account_id: account.id.clone(),
            imap,
            maildir_root,
            notmuch_db_path,
            notmuch_lock,
            state_db_path,
            mailbox: DEFAULT_MAILBOX.to_string(),
            events_tx: None,
            progress: None,
        })
    }

    pub fn with_mailbox(mut self, mailbox: impl Into<String>) -> Self {
        self.mailbox = mailbox.into();
        self
    }

    /// Attach a progress sink that receives [`SyncProgress`] milestones as the
    /// sync proceeds. Without it, the sync runs silently (behaviour unchanged).
    pub fn with_progress<F>(mut self, sink: F) -> Self
    where
        F: Fn(SyncProgress) + Send + Sync + 'static,
    {
        self.progress = Some(Arc::new(sink));
        self
    }

    fn progress(&self, p: SyncProgress) {
        if let Some(sink) = &self.progress {
            sink(p);
        }
    }

    /// The password store name and a *safe* reference to log. For `plain` the
    /// reference holds the secret, so it is deliberately withheld.
    fn credential_descriptor(&self) -> (&'static str, Option<String>) {
        match self.imap.credential_backend {
            CredentialBackend::Keyring => ("keyring", Some(self.imap.credential_ref.clone())),
            CredentialBackend::Pass => ("pass", Some(self.imap.credential_ref.clone())),
            CredentialBackend::Plain => ("plain", None),
        }
    }

    /// Attach the SSE broadcast sender so indexing progress is published as
    /// [`IndexEvent`]s. Without it, indexing proceeds silently.
    pub fn with_events_tx(mut self, tx: broadcast::Sender<BroadcastEvent>) -> Self {
        self.events_tx = Some(tx);
        self
    }

    fn emit_index(&self, status: SyncStatus, indexed: u32, error: Option<String>) {
        if let Some(tx) = &self.events_tx {
            let _ = tx.send(BroadcastEvent::Index(IndexEvent {
                account_id: self.account_id.clone(),
                mailbox: Some(self.mailbox.clone()),
                status,
                indexed,
                error,
            }));
        }
    }

    /// Run a full sync cycle for this account's selected mailbox.
    #[instrument(skip(self), fields(account = %self.account_id, mailbox = %self.mailbox))]
    pub async fn sync(&self) -> Result<SyncReport, ImapSyncError> {
        info!(account = %self.account_id, mailbox = %self.mailbox, "starting IMAP sync");

        let account_cfg = self.account_config_for_credential_lookup();
        let (backend, reference) = self.credential_descriptor();
        self.progress(SyncProgress::ResolvingCredentials { backend, reference });
        let password = credentials::resolve(&account_cfg).await?;
        self.progress(SyncProgress::CredentialsResolved { backend });

        self.progress(SyncProgress::Connecting {
            host: self.imap.imap_host.clone(),
            port: self.imap.imap_port,
        });
        let mut client = self.connect_and_auth(&password).await?;
        self.progress(SyncProgress::Authenticated);

        let condstore_supported = client.state.ext_condstore_supported();
        if condstore_supported {
            let _ = client.enable_condstore_if_supported().await;
        }

        let select_data = client.select(self.mailbox.clone()).await.map_err(|e| {
            ImapSyncError::Select { mailbox: self.mailbox.clone(), message: e.to_string() }
        })?;

        let uid_validity = select_data.uid_validity.map(|v| v.get()).unwrap_or(0);
        let highest_modseq = select_data.highest_modseq.map(|v| v.get());
        self.progress(SyncProgress::MailboxSelected {
            mailbox: self.mailbox.clone(),
            uid_validity,
        });

        let state_db = SyncStateDb::open(&self.state_db_path)?;
        let stored = state_db.get_mailbox_state(&self.account_id, &self.mailbox)?;

        let mut full_resync = false;
        if let Some(prev) = &stored {
            if prev.uid_validity != uid_validity {
                warn!(
                    account = %self.account_id,
                    mailbox = %self.mailbox,
                    old = prev.uid_validity, new = uid_validity,
                    "UIDVALIDITY changed; performing full resync"
                );
                state_db.delete_mailbox_state(&self.account_id, &self.mailbox)?;
                state_db.forget_all_uids_for_mailbox(&self.account_id, &self.mailbox)?;
                full_resync = true;
            }
        }

        let stored_modseq = if full_resync { None } else { stored.as_ref().and_then(|s| s.highest_modseq) };

        let use_condstore = condstore_supported && !full_resync && stored_modseq.is_some();

        let target_uids = if use_condstore {
            let modseq = stored_modseq.unwrap();
            self.fetch_changed_uids(&mut client, modseq).await?
        } else {
            if !condstore_supported {
                warn!(account = %self.account_id, "server does not advertise CONDSTORE; full UID scan");
            }
            self.fetch_all_uids(&mut client).await?
        };

        let stored_uid_records = state_db.list_stored_uids(&self.account_id, &self.mailbox)?;
        let stored_uid_set: HashSet<u32> = stored_uid_records.iter().map(|(u, _)| *u).collect();

        let new_uids: Vec<u32> = target_uids
            .iter()
            .copied()
            .filter(|u| !stored_uid_set.contains(u))
            .collect();
        self.progress(SyncProgress::NewMessages { count: new_uids.len() });

        let maildir_cur = self.maildir_root.join(&self.mailbox).join("cur");
        std::fs::create_dir_all(&maildir_cur).map_err(|e| ImapSyncError::MaildirIo {
            path: maildir_cur.clone(),
            source: e,
        })?;
        std::fs::create_dir_all(self.maildir_root.join(&self.mailbox).join("new")).ok();
        std::fs::create_dir_all(self.maildir_root.join(&self.mailbox).join("tmp")).ok();

        // Process each batch end-to-end before the next: fetch bodies → write to
        // the maildir → index into notmuch → checkpoint the batch's UIDs. A first
        // sync of a large mailbox therefore streams progress, keeps peak memory
        // to one batch of bodies, makes mail searchable as it arrives, and — if
        // interrupted — retains every batch it already pulled (no re-fetch).
        let total_new = new_uids.len();
        let mut written_files: Vec<(u32, PathBuf, String)> = Vec::new();
        let mut indexed = 0usize;
        let mut started_indexing = false;
        for chunk in new_uids.chunks(FETCH_BATCH_SIZE) {
            self.progress(SyncProgress::FetchingBatch { count: chunk.len() });
            let fetched = self.fetch_message_bodies(&mut client, chunk).await?;
            self.progress(SyncProgress::BatchFetched { count: fetched.len() });

            let mut batch: Vec<(u32, PathBuf, String)> = Vec::new();
            for (uid, body, flags) in fetched {
                self.progress(SyncProgress::MessageFetched { uid });
                let basename = maildir_basename(uid_validity, uid, &flags);
                let path = maildir_cur.join(&basename);
                std::fs::write(&path, &body).map_err(|e| ImapSyncError::MaildirIo {
                    path: path.clone(),
                    source: e,
                })?;
                self.progress(SyncProgress::MessageStored { uid, path: path.clone() });
                batch.push((uid, path, basename));
            }

            if !batch.is_empty() {
                if !started_indexing {
                    self.progress(SyncProgress::IndexingStarted { count: total_new });
                    started_indexing = true;
                }
                self.index_in_notmuch(&batch, &[], &maildir_cur).await?;
                // Checkpoint this batch's UIDs so an interrupted sync need not
                // re-fetch them next time.
                for (uid, _, basename) in &batch {
                    state_db.record_uid(&self.account_id, &self.mailbox, *uid, basename)?;
                }
                indexed += batch.len();
                self.progress(SyncProgress::IndexingProgress { indexed, total: total_new });
                written_files.extend(batch);
            }
        }
        if started_indexing {
            self.progress(SyncProgress::IndexingFinished { indexed });
        }

        let server_uid_set: HashSet<u32> = if use_condstore {
            self.list_server_uids(&mut client).await?.into_iter().collect()
        } else {
            target_uids.iter().copied().collect()
        };

        let deleted: Vec<(u32, String)> = stored_uid_records
            .into_iter()
            .filter(|(uid, _)| !server_uid_set.contains(uid))
            .collect();

        for (uid, basename) in &deleted {
            let path = maildir_cur.join(basename);
            let _ = std::fs::remove_file(&path);
            self.progress(SyncProgress::MessageDeleted { uid: *uid });
        }
        if !deleted.is_empty() {
            self.index_in_notmuch(&[], &deleted, &maildir_cur).await?;
        }
        for (uid, _) in &deleted {
            state_db.forget_uid(&self.account_id, &self.mailbox, *uid)?;
        }

        let new_state = ImapMailboxState {
            uid_validity,
            highest_modseq,
            last_sync_at: Some(now_iso8601()),
        };
        state_db.save_mailbox_state(&self.account_id, &self.mailbox, &new_state)?;

        let report = SyncReport {
            account_id: self.account_id.clone(),
            mailbox: self.mailbox.clone(),
            fetched: written_files.len() as u32,
            deleted: deleted.len() as u32,
            used_condstore: use_condstore,
            uid_validity,
            highest_modseq,
        };

        info!(
            account = %self.account_id,
            mailbox = %self.mailbox,
            fetched = report.fetched,
            deleted = report.deleted,
            condstore = report.used_condstore,
            "IMAP sync complete"
        );

        Ok(report)
    }

    fn account_config_for_credential_lookup(&self) -> AccountConfig {
        AccountConfig {
            id: self.account_id.clone(),
            protocol: ProtocolConfig::Imap(self.imap.clone()),
        }
    }

    async fn connect_and_auth(&self, password: &str) -> Result<Client, ImapSyncError> {
        let mut client = if self.imap.imap_tls {
            Client::rustls(&self.imap.imap_host, self.imap.imap_port, false, None)
                .await
                .map_err(|e| ImapSyncError::Connect {
                    host: self.imap.imap_host.clone(),
                    port: self.imap.imap_port,
                    message: e.to_string(),
                })?
        } else {
            Client::insecure(&self.imap.imap_host, self.imap.imap_port)
                .await
                .map_err(|e| ImapSyncError::Connect {
                    host: self.imap.imap_host.clone(),
                    port: self.imap.imap_port,
                    message: e.to_string(),
                })?
        };

        // Prefer SASL PLAIN; some servers (e.g. Stalwart) only allow LOGIN on a
        // non-TLS port after an explicit opt-in. Fall back to LOGIN on failure.
        let auth_result = client.authenticate_plain(&self.imap.email, password).await;
        if let Err(auth_err) = auth_result {
            let login_result = client.login(self.imap.email.as_str(), password).await;
            login_result.map_err(|login_err| ImapSyncError::Auth {
                login: self.imap.email.clone(),
                message: format!(
                    "AUTHENTICATE PLAIN: {}; LOGIN: {}",
                    error_chain(&auth_err),
                    error_chain(&login_err)
                ),
            })?;
        }

        Ok(client)
    }

    async fn fetch_changed_uids(
        &self,
        client: &mut Client,
        since_modseq: u64,
    ) -> Result<Vec<u32>, ImapSyncError> {
        let modseq = NonZeroU64::new(since_modseq).unwrap_or(NonZeroU64::new(1).unwrap());
        let items = MacroOrMessageDataItemNames::MessageDataItemNames(vec![
            MessageDataItemName::Uid,
        ]);
        let modifiers = vec![FetchModifier::ChangedSince(modseq)];
        let seq = SequenceSet::try_from("1:*").map_err(|e| ImapSyncError::Fetch {
            mailbox: self.mailbox.clone(),
            message: format!("sequence parse: {e}"),
        })?;
        let result = client
            .uid_fetch_with_modifiers(seq, items, modifiers)
            .await
            .map_err(|e| ImapSyncError::Fetch {
                mailbox: self.mailbox.clone(),
                message: e.to_string(),
            })?;
        let mut uids = Vec::new();
        for (key, items) in result {
            uids.push(extract_uid_from_items(key, items.as_ref()));
        }
        uids.sort_unstable();
        uids.dedup();
        Ok(uids)
    }

    async fn fetch_all_uids(&self, client: &mut Client) -> Result<Vec<u32>, ImapSyncError> {
        let key: SearchKey<'static> = SearchKey::All;
        let v1: Vec1<SearchKey<'static>> = Vec1::from(key);
        let result =
            client.uid_search(v1).await.map_err(|e| ImapSyncError::Fetch {
                mailbox: self.mailbox.clone(),
                message: e.to_string(),
            })?;
        Ok(result.into_iter().map(|nz| nz.get()).collect())
    }

    async fn list_server_uids(&self, client: &mut Client) -> Result<Vec<u32>, ImapSyncError> {
        self.fetch_all_uids(client).await
    }

    async fn fetch_message_bodies(
        &self,
        client: &mut Client,
        uids: &[u32],
    ) -> Result<Vec<(u32, Vec<u8>, Vec<Flag<'static>>)>, ImapSyncError> {
        if uids.is_empty() {
            return Ok(Vec::new());
        }
        let seq_str = uids
            .iter()
            .map(|u| u.to_string())
            .collect::<Vec<_>>()
            .join(",");
        let seq = SequenceSet::try_from(seq_str.as_str()).map_err(|e| ImapSyncError::Fetch {
            mailbox: self.mailbox.clone(),
            message: format!("sequence parse: {e}"),
        })?;
        let items = MacroOrMessageDataItemNames::MessageDataItemNames(vec![
            MessageDataItemName::Uid,
            MessageDataItemName::Flags,
            MessageDataItemName::BodyExt {
                section: None,
                partial: None,
                peek: true,
            },
        ]);
        let result = client.uid_fetch(seq, items).await.map_err(|e| ImapSyncError::Fetch {
            mailbox: self.mailbox.clone(),
            message: e.to_string(),
        })?;

        let mut out = Vec::new();
        for (_key, msg_items) in result {
            let mut uid: Option<u32> = None;
            let mut body: Option<Vec<u8>> = None;
            let mut flags: Vec<Flag<'static>> = Vec::new();
            for item in msg_items.as_ref() {
                match item {
                    MessageDataItem::Uid(u) => {
                        uid = Some(u.get());
                    }
                    MessageDataItem::Flags(fs) => {
                        flags = fs
                            .iter()
                            .filter_map(|f| match f {
                                FlagFetch::Flag(flag) => Some(flag.to_static()),
                                FlagFetch::Recent => None,
                            })
                            .collect();
                    }
                    MessageDataItem::BodyExt { data, .. } => {
                        if let Some(d) = data.0.as_ref() {
                            body = Some(d.as_ref().to_vec());
                        }
                    }
                    _ => {}
                }
            }
            match (uid, body) {
                (Some(uid), Some(body)) => out.push((uid, body, flags)),
                (uid, body) => {
                    debug!(?uid, body_len = body.as_ref().map(|b| b.len()), "skipping incomplete fetch item");
                    self.progress(SyncProgress::MessageFailed {
                        uid,
                        reason: "incomplete fetch response (missing UID or body)".to_string(),
                    });
                }
            }
        }
        Ok(out)
    }

    async fn index_in_notmuch(
        &self,
        written: &[(u32, PathBuf, String)],
        deleted: &[(u32, String)],
        maildir_cur: &Path,
    ) -> Result<(), ImapSyncError> {
        if written.is_empty() && deleted.is_empty() {
            return Ok(());
        }
        let indexed_count = written.len() as u32;
        self.emit_index(SyncStatus::Running, 0, None);

        let _guard = self.notmuch_lock.0.lock().await;
        let db_path = self.notmuch_db_path.clone();
        let account_id = self.account_id.clone();
        let mailbox = self.mailbox.clone();
        let written = written.to_vec();
        let deleted_paths: Vec<PathBuf> =
            deleted.iter().map(|(_, b)| maildir_cur.join(b)).collect();

        let result = tokio::task::spawn_blocking(move || -> Result<(), ImapSyncError> {
            let db = notmuch::Database::open_with_config(
                Some(&db_path),
                notmuch::DatabaseMode::ReadWrite,
                None::<&Path>,
                None,
            )
            .map_err(|e| ImapSyncError::Notmuch(format!("open ReadWrite: {e}")))?;

            for (_uid, path, _basename) in &written {
                let msg = db
                    .index_file(path, None)
                    .map_err(|e| ImapSyncError::Notmuch(format!("index {}: {e}", path.display())))?;
                msg.add_tag(&format!("account:{account_id}"))
                    .map_err(|e| ImapSyncError::Notmuch(format!("tag account: {e}")))?;
                msg.add_tag(&format!("mailbox:{mailbox}"))
                    .map_err(|e| ImapSyncError::Notmuch(format!("tag mailbox: {e}")))?;
            }

            for path in &deleted_paths {
                if let Ok(Some(msg)) = db.find_message_by_filename(path) {
                    msg.add_tag("deleted")
                        .map_err(|e| ImapSyncError::Notmuch(format!("tag deleted: {e}")))?;
                }
            }

            drop(db);
            Ok(())
        })
        .await
        .map_err(|e| ImapSyncError::Notmuch(format!("join: {e}")));

        match result {
            Ok(Ok(())) => {
                self.emit_index(SyncStatus::Done, indexed_count, None);
                Ok(())
            }
            Ok(Err(e)) | Err(e) => {
                self.emit_index(SyncStatus::Error, 0, Some(e.to_string()));
                Err(e)
            }
        }
    }
}

/// Walk an error's `source()` chain and join the messages with `: `.
fn error_chain(err: &dyn std::error::Error) -> String {
    let mut out = err.to_string();
    let mut next = err.source();
    while let Some(src) = next {
        out.push_str(": ");
        out.push_str(&src.to_string());
        next = src.source();
    }
    out
}

fn extract_uid_from_items(key: NonZeroU32, items: &[MessageDataItem<'_>]) -> u32 {
    for item in items {
        if let MessageDataItem::Uid(u) = item {
            return u.get();
        }
    }
    key.get()
}

fn maildir_basename(uid_validity: u32, uid: u32, flags: &[Flag<'_>]) -> String {
    let mut suffix = String::new();
    for f in flags {
        match f {
            Flag::Seen => suffix.push('S'),
            Flag::Answered => suffix.push('R'),
            Flag::Flagged => suffix.push('F'),
            Flag::Draft => suffix.push('D'),
            Flag::Deleted => suffix.push('T'),
            _ => {}
        }
    }
    format!("{}_{}.mailbrus:2,{}", uid_validity, uid, suffix)
}

fn now_iso8601() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{CredentialBackend, ImapConfig};

    fn imap_config() -> ImapConfig {
        ImapConfig {
            email: "user@example.com".to_string(),
            display_name: None,
            imap_host: "imap.example.com".to_string(),
            imap_port: 993,
            imap_tls: true,
            credential_backend: CredentialBackend::Keyring,
            credential_ref: "test".to_string(),
            maildir_root: None,
            pass_gpg_backend: None,
        }
    }

    #[test]
    fn maildir_basename_includes_uid_validity_uid_and_flags() {
        let name = maildir_basename(42, 123, &[Flag::Seen, Flag::Flagged]);
        assert_eq!(name, "42_123.mailbrus:2,SF");
    }

    #[test]
    fn maildir_basename_no_flags() {
        let name = maildir_basename(1, 7, &[]);
        assert_eq!(name, "1_7.mailbrus:2,");
    }

    #[test]
    fn worker_construction_resolves_default_maildir_root() {
        let account = AccountConfig {
            id: "acc1".to_string(),
            protocol: ProtocolConfig::Imap(imap_config()),
        };
        let lock = NotmuchLock::default();
        let worker = ImapWorker::new(
            &account,
            PathBuf::from("/tmp/notmuch"),
            lock,
            PathBuf::from("/tmp/sync.db"),
        )
        .unwrap();
        assert_eq!(worker.account_id, "acc1");
        assert_eq!(worker.mailbox, "INBOX");
        assert!(worker.maildir_root.to_string_lossy().contains("acc1"));
    }

    #[test]
    fn worker_with_mailbox_overrides_default() {
        let account = AccountConfig {
            id: "acc1".to_string(),
            protocol: ProtocolConfig::Imap(imap_config()),
        };
        let worker = ImapWorker::new(
            &account,
            PathBuf::from("/tmp/notmuch"),
            NotmuchLock::default(),
            PathBuf::from("/tmp/sync.db"),
        )
        .unwrap()
        .with_mailbox("Archive");
        assert_eq!(worker.mailbox, "Archive");
    }
}
