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
use io_maildir::{
    client::MaildirClient,
    flag::{MaildirFlag, MaildirFlags},
    maildir::MaildirSubdir,
    path::MaildirFsPath,
};
use sha2::{Digest, Sha256};
use thiserror::Error;
use tokio::sync::{broadcast, Mutex};
use tracing::{debug, info, instrument, warn};

use crate::config::{AccountConfig, CredentialBackend, ImapConfig, ProtocolConfig};
use crate::credentials::{self, CredentialError};
use crate::sync::engine::{BroadcastEvent, IndexEvent, LifecycleEvent, SyncStatus};
use crate::sync::state::{
    normalize_flags, ImapMailboxState, StoredMessage, SyncStateDb, SyncStateError,
};

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
    #[error("maildir error in {mailbox}: {message}")]
    Maildir { mailbox: String, message: String },
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
    /// A stored message's flags were changed server-side and applied locally.
    /// `flags` is the new normalised maildir letter set.
    FlagsUpdated { uid: u32, flags: String },
    /// The on-disk content of a stored message no longer matches its recorded
    /// revision, i.e. it was edited locally. Reported, not silently ignored;
    /// the flag change is still applied, since a rename preserves content.
    RevisionDiverged { uid: u32 },
    IndexingStarted { count: usize },
    /// `indexed` of `total` messages indexed so far.
    IndexingProgress { indexed: usize, total: usize },
    IndexingFinished { indexed: usize },
}

/// A callback invoked synchronously for each [`SyncProgress`] milestone.
pub type ProgressSink = Arc<dyn Fn(SyncProgress) + Send + Sync>;

/// A message delivered to the maildir, with the state to checkpoint for it.
#[derive(Debug, Clone)]
struct Delivered {
    uid: u32,
    /// Identifier minted at delivery; stable across later flag renames.
    maildir_id: String,
    path: PathBuf,
    /// Normalised maildir flag letters, as delivered.
    flags: String,
    revision: String,
}

/// The outcome of applying one server-side flag change locally.
#[derive(Debug, Clone)]
struct FlagChange {
    uid: u32,
    old_path: PathBuf,
    new_path: PathBuf,
    flags: String,
    revision: String,
    /// The on-disk content did not match the recorded revision.
    diverged: bool,
}

/// Map a [`SyncProgress`] milestone to a UI lifecycle `(stage, detail)`, or
/// `None` for milestones not surfaced in the event log. `detail` is sanitized:
/// it never contains a password — only the backend name, `host:port`, or a count.
fn lifecycle_of(p: &SyncProgress) -> Option<(&'static str, Option<String>)> {
    match p {
        SyncProgress::ResolvingCredentials { backend, .. } => {
            Some(("checking_password", Some((*backend).to_string())))
        }
        SyncProgress::CredentialsResolved { backend } => {
            Some(("password_retrieved", Some((*backend).to_string())))
        }
        SyncProgress::Connecting { host, port } => {
            Some(("connecting", Some(format!("{host}:{port}"))))
        }
        SyncProgress::Authenticated => Some(("connected", None)),
        SyncProgress::FetchingBatch { count } => {
            Some(("fetching", Some(format!("{count} messages"))))
        }
        SyncProgress::BatchFetched { count } => {
            Some(("fetched", Some(format!("{count} messages"))))
        }
        _ => None,
    }
}

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
        // Forward credential/connection/fetch milestones to the SSE channel as
        // `lifecycle` events so the UI event log can show fine-grained progress.
        // `detail` is sanitized (backend name / host:port / count) — never a secret.
        if let Some(tx) = &self.events_tx {
            if let Some((stage, detail)) = lifecycle_of(&p) {
                let _ = tx.send(BroadcastEvent::Lifecycle(LifecycleEvent {
                    account_id: self.account_id.clone(),
                    mailbox: Some(self.mailbox.clone()),
                    stage: stage.to_string(),
                    detail,
                }));
            }
        }
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

        // Gmail returns HIGHESTMODSEQ in SELECT responses but does not advertise
        // CONDSTORE in its capability list, so also treat a present highest_modseq
        // as evidence of CONDSTORE support.
        let condstore_effective = condstore_supported || highest_modseq.is_some();
        let use_condstore = condstore_effective && !full_resync && stored_modseq.is_some();

        let target_uids = if use_condstore {
            let modseq = stored_modseq.unwrap();
            self.fetch_changed_uids(&mut client, modseq).await?
        } else {
            if !condstore_supported && !condstore_effective {
                warn!(account = %self.account_id, "server does not advertise CONDSTORE; full UID scan");
            }
            self.fetch_all_uids(&mut client).await?
        };

        let stored_uid_records = state_db.list_stored_uids(&self.account_id, &self.mailbox)?;
        let stored_by_uid: std::collections::HashMap<u32, StoredMessage> = stored_uid_records
            .iter()
            .map(|s| (s.uid, s.clone()))
            .collect();

        // Partition rather than filter. The pre-partition code kept only UIDs
        // absent from stored state, which under CONDSTORE discards exactly the
        // set the server reported as changed — so a flag change made elsewhere
        // never reached the local index.
        let (changed_uids, new_uids): (Vec<u32>, Vec<u32>) = target_uids
            .iter()
            .copied()
            .partition(|u| stored_by_uid.contains_key(u));
        self.progress(SyncProgress::NewMessages { count: new_uids.len() });

        // The maildir root holds one maildir per mailbox; `create_maildir` is
        // create_dir_all under the hood, so calling it every sync is safe and
        // guarantees cur/new/tmp exist before any delivery.
        self.ensure_maildir().await?;
        let maildir_cur = self.maildir_root.join(&self.mailbox).join("cur");

        // Unlink any files left by a pre-v2 database. The migration preserved
        // their basenames precisely because re-delivery mints new filenames, so
        // the originals would otherwise linger in cur/ still indexed by notmuch.
        let legacy = state_db.legacy_maildir_files(&self.account_id, &self.mailbox)?;
        let had_legacy = !legacy.is_empty();
        self.purge_legacy_files(legacy, &maildir_cur).await?;
        if had_legacy {
            state_db.clear_legacy_maildir_files(&self.account_id, &self.mailbox)?;
        }

        // Process each batch end-to-end before the next: fetch bodies → deliver
        // to the maildir → index into notmuch → checkpoint the batch's UIDs. A
        // first sync of a large mailbox therefore streams progress, keeps peak
        // memory to one batch of bodies, makes mail searchable as it arrives,
        // and — if interrupted — retains every batch it already pulled.
        let total_new = new_uids.len();
        let mut written_files: Vec<(u32, PathBuf, String)> = Vec::new();
        let mut indexed = 0usize;
        let mut started_indexing = false;
        for chunk in new_uids.chunks(FETCH_BATCH_SIZE) {
            self.progress(SyncProgress::FetchingBatch { count: chunk.len() });
            let fetched = self.fetch_message_bodies(&mut client, chunk).await?;
            self.progress(SyncProgress::BatchFetched { count: fetched.len() });

            for (uid, _, _) in &fetched {
                self.progress(SyncProgress::MessageFetched { uid: *uid });
            }

            // One spawn_blocking for the whole batch: the maildir client is
            // synchronous, and a thread hop per message would dwarf the work.
            let delivered = self.deliver_batch(fetched).await?;

            let mut batch: Vec<(u32, PathBuf, String)> = Vec::new();
            for d in &delivered {
                self.progress(SyncProgress::MessageStored {
                    uid: d.uid,
                    path: d.path.clone(),
                });
                batch.push((d.uid, d.path.clone(), d.maildir_id.clone()));
            }

            if !batch.is_empty() {
                if !started_indexing {
                    self.progress(SyncProgress::IndexingStarted { count: total_new });
                    started_indexing = true;
                }
                self.index_in_notmuch(&batch, &[], &[], &maildir_cur).await?;
                // Checkpoint this batch's UIDs so an interrupted sync need not
                // re-fetch them next time.
                for d in &delivered {
                    state_db.record_uid(
                        &self.account_id,
                        &self.mailbox,
                        d.uid,
                        &d.maildir_id,
                        &d.flags,
                        &d.revision,
                    )?;
                }
                indexed += batch.len();
                self.progress(SyncProgress::IndexingProgress { indexed, total: total_new });
                written_files.extend(batch);
            }
        }
        if started_indexing {
            self.progress(SyncProgress::IndexingFinished { indexed });
        }

        // Flags-only pass over the already-stored UIDs the server reported as
        // changed. No body is re-fetched.
        let flag_changes = self.sync_flags(&mut client, &changed_uids, &stored_by_uid).await?;
        let reflagged: Vec<(PathBuf, PathBuf)> = flag_changes
            .iter()
            .filter(|c| c.old_path != c.new_path)
            .map(|c| (c.old_path.clone(), c.new_path.clone()))
            .collect();
        if !reflagged.is_empty() {
            self.index_in_notmuch(&[], &[], &reflagged, &maildir_cur).await?;
        }
        for change in &flag_changes {
            state_db.update_flags(
                &self.account_id,
                &self.mailbox,
                change.uid,
                &change.flags,
                &change.revision,
            )?;
        }

        let server_uid_set: HashSet<u32> = if use_condstore {
            self.list_server_uids(&mut client).await?.into_iter().collect()
        } else {
            target_uids.iter().copied().collect()
        };

        let deleted: Vec<StoredMessage> = stored_uid_records
            .into_iter()
            .filter(|s| !server_uid_set.contains(&s.uid))
            .collect();

        if !deleted.is_empty() {
            // Resolve each file from its stored identifier, not from a
            // flag-encoding basename: the filename may have been renamed by a
            // flag update since delivery.
            let deleted_paths = self.delete_entries(&deleted).await?;
            for s in &deleted {
                self.progress(SyncProgress::MessageDeleted { uid: s.uid });
            }
            self.index_in_notmuch(&[], &deleted_paths, &[], &maildir_cur).await?;
        }
        for s in &deleted {
            state_db.forget_uid(&self.account_id, &self.mailbox, s.uid)?;
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

    /// Fetch only the flags for `uids`.
    ///
    /// Deliberately separate from [`Self::fetch_message_bodies`]: a flag change
    /// must not re-download the message body, which on a large mailbox would
    /// turn a cheap CONDSTORE delta into a full re-fetch.
    async fn fetch_message_flags(
        &self,
        client: &mut Client,
        uids: &[u32],
    ) -> Result<Vec<(u32, Vec<Flag<'static>>)>, ImapSyncError> {
        if uids.is_empty() {
            return Ok(Vec::new());
        }
        let seq = self.sequence_set(uids)?;
        let items = MacroOrMessageDataItemNames::MessageDataItemNames(vec![
            MessageDataItemName::Uid,
            MessageDataItemName::Flags,
        ]);
        let result = client.uid_fetch(seq, items).await.map_err(|e| ImapSyncError::Fetch {
            mailbox: self.mailbox.clone(),
            message: e.to_string(),
        })?;

        let mut out = Vec::new();
        for (_key, msg_items) in result {
            let mut uid: Option<u32> = None;
            let mut flags: Vec<Flag<'static>> = Vec::new();
            for item in msg_items.as_ref() {
                match item {
                    MessageDataItem::Uid(u) => uid = Some(u.get()),
                    MessageDataItem::Flags(fs) => {
                        flags = fs
                            .iter()
                            .filter_map(|f| match f {
                                FlagFetch::Flag(flag) => Some(flag.to_static()),
                                FlagFetch::Recent => None,
                            })
                            .collect();
                    }
                    _ => {}
                }
            }
            match uid {
                Some(uid) => out.push((uid, flags)),
                None => debug!("skipping FLAGS fetch item with no UID"),
            }
        }
        Ok(out)
    }

    fn sequence_set(&self, uids: &[u32]) -> Result<SequenceSet, ImapSyncError> {
        let seq_str = uids
            .iter()
            .map(|u| u.to_string())
            .collect::<Vec<_>>()
            .join(",");
        SequenceSet::try_from(seq_str.as_str()).map_err(|e| ImapSyncError::Fetch {
            mailbox: self.mailbox.clone(),
            message: format!("sequence parse: {e}"),
        })
    }

    async fn fetch_message_bodies(
        &self,
        client: &mut Client,
        uids: &[u32],
    ) -> Result<Vec<(u32, Vec<u8>, Vec<Flag<'static>>)>, ImapSyncError> {
        if uids.is_empty() {
            return Ok(Vec::new());
        }
        let seq = self.sequence_set(uids)?;
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

    /// Build a maildir client rooted at this account's maildir root.
    ///
    /// Cheap — it holds only an owned path — so it is rebuilt per blocking
    /// closure rather than shared across threads.
    fn maildir_client(&self) -> MaildirClient {
        MaildirClient::new(MaildirFsPath::new(
            self.maildir_root.to_string_lossy().into_owned(),
        ))
    }

    fn maildir_err(&self, message: String) -> ImapSyncError {
        ImapSyncError::Maildir {
            mailbox: self.mailbox.clone(),
            message,
        }
    }

    /// Create the mailbox's maildir (and its `cur`/`new`/`tmp` subdirs) if absent.
    async fn ensure_maildir(&self) -> Result<(), ImapSyncError> {
        let client = self.maildir_client();
        let mailbox = self.mailbox.clone();
        let result = tokio::task::spawn_blocking(move || client.create_maildir(mailbox.as_str()))
            .await
            .map_err(|e| self.maildir_err(format!("join: {e}")))?;
        result.map_err(|e| self.maildir_err(format!("create maildir: {e}")))
    }

    /// Unlink maildir files recorded by the v1 -> v2 migration.
    ///
    /// Runs before delivery so the mailbox is clean by the time re-delivery
    /// writes the replacements. Takes the basenames by value rather than a
    /// `&SyncStateDb`: rusqlite's `Connection` is `Send` but not `Sync`, so a
    /// borrow held across an `.await` would make this future non-`Send`. The
    /// caller owns the handle and does the bookkeeping.
    async fn purge_legacy_files(
        &self,
        legacy: Vec<String>,
        maildir_cur: &Path,
    ) -> Result<(), ImapSyncError> {
        if legacy.is_empty() {
            return Ok(());
        }
        info!(
            account = %self.account_id,
            mailbox = %self.mailbox,
            count = legacy.len(),
            "removing pre-v2 maildir files ahead of re-delivery"
        );
        let paths: Vec<PathBuf> = legacy.iter().map(|b| maildir_cur.join(b)).collect();
        tokio::task::spawn_blocking(move || {
            for p in &paths {
                // Best-effort: a file already gone is the desired end state.
                let _ = std::fs::remove_file(p);
            }
        })
        .await
        .map_err(|e| self.maildir_err(format!("join: {e}")))?;
        Ok(())
    }

    /// Deliver a batch of fetched messages through the maildir delivery
    /// protocol (write to `tmp/`, then atomically rename into `cur/`).
    async fn deliver_batch(
        &self,
        fetched: Vec<(u32, Vec<u8>, Vec<Flag<'static>>)>,
    ) -> Result<Vec<Delivered>, ImapSyncError> {
        if fetched.is_empty() {
            return Ok(Vec::new());
        }
        let client = self.maildir_client();
        let mailbox = self.mailbox.clone();

        let result = tokio::task::spawn_blocking(
            move || -> Result<Vec<Delivered>, String> {
                let maildir = client
                    .load_maildir(mailbox.as_str())
                    .map_err(|e| format!("load maildir: {e}"))?;
                let mut out = Vec::with_capacity(fetched.len());
                for (uid, body, flags) in fetched {
                    let revision = content_revision(&body);
                    let mflags = maildir_flags_from_imap(&flags);
                    let (id, path) = client
                        .store(maildir.clone(), MaildirSubdir::Cur, mflags.clone(), body)
                        .map_err(|e| format!("store uid {uid}: {e}"))?;
                    out.push(Delivered {
                        uid,
                        maildir_id: id,
                        path: PathBuf::from(path.as_str()),
                        flags: mflags.to_string(),
                        revision,
                    });
                }
                Ok(out)
            },
        )
        .await
        .map_err(|e| self.maildir_err(format!("join: {e}")))?;

        result.map_err(|e| self.maildir_err(e))
    }

    /// Apply server-side flag changes to already-stored messages.
    ///
    /// Returns one [`FlagChange`] per message actually touched. State writes are
    /// left to the caller: rusqlite's `Connection` is `Send` but not `Sync`, so
    /// borrowing the DB across the `.await`s here would make this future
    /// non-`Send` and it could no longer be `tokio::spawn`ed.
    async fn sync_flags(
        &self,
        client_imap: &mut Client,
        changed_uids: &[u32],
        stored: &std::collections::HashMap<u32, StoredMessage>,
    ) -> Result<Vec<FlagChange>, ImapSyncError> {
        if changed_uids.is_empty() {
            return Ok(Vec::new());
        }

        let mut changes = Vec::new();
        for chunk in changed_uids.chunks(FETCH_BATCH_SIZE) {
            let fetched = self.fetch_message_flags(client_imap, chunk).await?;

            // Only UIDs whose normalised flags actually differ reach the disk.
            // Without this, every CONDSTORE sync would rename and re-index each
            // reported message even when the change was already applied.
            let mut pending = Vec::new();
            for (uid, flags) in fetched {
                let Some(stored_msg) = stored.get(&uid) else {
                    continue;
                };
                // Normalise before comparing. `MaildirFlags` renders letters in
                // enum-declaration order (P,R,S,T,D,F), while the stored column
                // is normalised alphabetically — comparing the two forms
                // directly would report a change on every sync and rename every
                // message forever.
                let next = normalize_flags(&maildir_flags_from_imap(&flags).to_string());
                if next == stored_msg.flags {
                    continue;
                }
                pending.push((stored_msg.clone(), next));
            }
            if pending.is_empty() {
                continue;
            }

            let client = self.maildir_client();
            let mailbox = self.mailbox.clone();
            let applied = tokio::task::spawn_blocking(
                move || -> Result<Vec<FlagChange>, String> {
                    let maildir = client
                        .load_maildir(mailbox.as_str())
                        .map_err(|e| format!("load maildir: {e}"))?;
                    let mut out = Vec::with_capacity(pending.len());
                    for (stored_msg, next_flags) in pending {
                        let (old_path, _, _) = client
                            .locate(maildir.clone(), &stored_msg.maildir_id)
                            .map_err(|e| {
                                format!("locate {}: {e}", stored_msg.maildir_id)
                            })?;
                        let old_path = PathBuf::from(old_path.as_str());

                        // Detect a local edit before touching the file. A rename
                        // preserves content, so we report and proceed rather than
                        // skipping — skipping would wedge the mailbox, since the
                        // server keeps reporting this UID as changed.
                        let on_disk = std::fs::read(&old_path)
                            .map_err(|e| format!("read {}: {e}", old_path.display()))?;
                        let actual = content_revision(&on_disk);
                        let diverged = actual != stored_msg.revision;

                        let mflags: MaildirFlags = next_flags
                            .chars()
                            .filter_map(MaildirFlag::from_char)
                            .collect();
                        client
                            .set_flags(maildir.clone(), &stored_msg.maildir_id, mflags)
                            .map_err(|e| {
                                format!("set flags {}: {e}", stored_msg.maildir_id)
                            })?;

                        let (new_path, _, _) = client
                            .locate(maildir.clone(), &stored_msg.maildir_id)
                            .map_err(|e| {
                                format!("re-locate {}: {e}", stored_msg.maildir_id)
                            })?;

                        out.push(FlagChange {
                            uid: stored_msg.uid,
                            old_path,
                            new_path: PathBuf::from(new_path.as_str()),
                            flags: next_flags,
                            // Re-baseline to the content actually on disk, so a
                            // reported divergence is not re-reported every sync.
                            revision: actual,
                            diverged,
                        });
                    }
                    Ok(out)
                },
            )
            .await
            .map_err(|e| self.maildir_err(format!("join: {e}")))?
            .map_err(|e| self.maildir_err(e))?;

            for change in applied {
                if change.diverged {
                    warn!(
                        account = %self.account_id,
                        mailbox = %self.mailbox,
                        uid = change.uid,
                        "local content diverges from recorded revision; applying flag \
                         change anyway (a rename preserves content) and re-baselining"
                    );
                    self.progress(SyncProgress::RevisionDiverged { uid: change.uid });
                }
                self.progress(SyncProgress::FlagsUpdated {
                    uid: change.uid,
                    flags: change.flags.clone(),
                });
                changes.push(change);
            }
        }
        Ok(changes)
    }

    /// Remove delivered entries by identifier, returning the paths removed.
    async fn delete_entries(
        &self,
        deleted: &[StoredMessage],
    ) -> Result<Vec<(u32, PathBuf)>, ImapSyncError> {
        let client = self.maildir_client();
        let mailbox = self.mailbox.clone();
        let targets: Vec<(u32, String)> = deleted
            .iter()
            .map(|s| (s.uid, s.maildir_id.clone()))
            .collect();

        let result = tokio::task::spawn_blocking(
            move || -> Result<Vec<(u32, PathBuf)>, String> {
                let maildir = client
                    .load_maildir(mailbox.as_str())
                    .map_err(|e| format!("load maildir: {e}"))?;
                let mut out = Vec::with_capacity(targets.len());
                for (uid, id) in targets {
                    // Resolve before deleting so notmuch can be told which
                    // filename went away.
                    match client.locate(maildir.clone(), &id) {
                        Ok((path, _, _)) => {
                            let path = PathBuf::from(path.as_str());
                            // Best-effort: a message already gone locally is the
                            // desired end state.
                            let _ = client.delete_entry(maildir.clone(), &id);
                            out.push((uid, path));
                        }
                        Err(e) => {
                            debug!(uid, id = %id, error = %e, "no maildir entry to delete");
                        }
                    }
                }
                Ok(out)
            },
        )
        .await
        .map_err(|e| self.maildir_err(format!("join: {e}")))?;

        result.map_err(|e| self.maildir_err(e))
    }

    /// Reconcile the notmuch index with the maildir.
    ///
    /// `reflagged` carries `(old_path, new_path)` for messages whose file was
    /// renamed by a flag update. notmuch indexes *by filename*, so a rename must
    /// be reported as a removal plus a re-index, or the index would keep
    /// resolving a path that no longer exists. The message object itself is
    /// keyed by Message-ID and survives, so only its filename set changes.
    async fn index_in_notmuch(
        &self,
        written: &[(u32, PathBuf, String)],
        deleted: &[(u32, PathBuf)],
        reflagged: &[(PathBuf, PathBuf)],
        _maildir_cur: &Path,
    ) -> Result<(), ImapSyncError> {
        if written.is_empty() && deleted.is_empty() && reflagged.is_empty() {
            return Ok(());
        }
        let indexed_count = written.len() as u32;
        self.emit_index(SyncStatus::Running, 0, None);

        let _guard = self.notmuch_lock.0.lock().await;
        let db_path = self.notmuch_db_path.clone();
        let account_id = self.account_id.clone();
        let mailbox = self.mailbox.clone();
        let written = written.to_vec();
        let deleted_paths: Vec<PathBuf> = deleted.iter().map(|(_, p)| p.clone()).collect();
        let reflagged = reflagged.to_vec();

        let result = tokio::task::spawn_blocking(move || -> Result<(), ImapSyncError> {
            let db = notmuch::Database::open_with_config(
                Some(&db_path),
                notmuch::DatabaseMode::ReadWrite,
                None::<&Path>,
                None,
            )
            .map_err(|e| ImapSyncError::Notmuch(format!("open ReadWrite: {e}")))?;

            // `index_file` does NOT apply the maildir flag -> tag mapping; only
            // `notmuch new` does. Without this call a synced message never gains
            // the `unread` tag, so every message the API reports reads as
            // already-read (`seen` is derived as `!tags.contains("unread")`) and
            // a flag change is invisible to the app. Applying it explicitly is
            // what makes flag propagation observable, and it keeps
            // replied/flagged/draft in step with the filename too.
            let sync_tags = |msg: &notmuch::Message| -> Result<(), ImapSyncError> {
                msg.maildir_flags_to_tags()
                    .map_err(|e| ImapSyncError::Notmuch(format!("maildir flags to tags: {e}")))?;
                msg.add_tag(&format!("account:{account_id}"))
                    .map_err(|e| ImapSyncError::Notmuch(format!("tag account: {e}")))?;
                msg.add_tag(&format!("mailbox:{mailbox}"))
                    .map_err(|e| ImapSyncError::Notmuch(format!("tag mailbox: {e}")))?;
                Ok(())
            };

            for (_uid, path, _id) in &written {
                let msg = db
                    .index_file(path, None)
                    .map_err(|e| ImapSyncError::Notmuch(format!("index {}: {e}", path.display())))?;
                sync_tags(&msg)?;
            }

            for (old_path, new_path) in &reflagged {
                // Order matters: drop the stale filename before adding the new
                // one, so the message never transiently carries both.
                db.remove_message(old_path).map_err(|e| {
                    ImapSyncError::Notmuch(format!("remove {}: {e}", old_path.display()))
                })?;
                let msg = db.index_file(new_path, None).map_err(|e| {
                    ImapSyncError::Notmuch(format!("reindex {}: {e}", new_path.display()))
                })?;
                sync_tags(&msg)?;
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

/// Translate IMAP flags into their maildir equivalents.
///
/// `\Recent` and unknown/custom flags are dropped: `\Recent` is per-session
/// IMAP state with no maildir representation, and custom keywords would need a
/// dovecot-keywords slot we do not allocate.
fn maildir_flags_from_imap(flags: &[Flag<'_>]) -> MaildirFlags {
    flags
        .iter()
        .filter_map(|f| match f {
            Flag::Seen => Some(MaildirFlag::Seen),
            Flag::Answered => Some(MaildirFlag::Replied),
            Flag::Flagged => Some(MaildirFlag::Flagged),
            Flag::Draft => Some(MaildirFlag::Draft),
            Flag::Deleted => Some(MaildirFlag::Trashed),
            _ => None,
        })
        .collect()
}

/// Hex sha256 of a message's bytes, used as the stored content revision.
///
/// Computed from the bytes we deliver, so recording it is free; comparing it
/// against the file later is what detects a local edit.
fn content_revision(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
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
            smtp_host: None,
            smtp_port: None,
            smtp_starttls: None,
            signature: None,
        }
    }

    #[test]
    fn imap_flag_order_from_the_server_does_not_affect_the_letters() {
        // MaildirFlags is backed by a BTreeSet, so Display is deterministic
        // regardless of the order the server reported the flags in.
        let a = maildir_flags_from_imap(&[Flag::Seen, Flag::Flagged]).to_string();
        let b = maildir_flags_from_imap(&[Flag::Flagged, Flag::Seen]).to_string();
        assert_eq!(a, b, "flag order from the server must not affect the letters");
    }

    #[test]
    fn stored_flag_comparison_uses_the_same_normalisation_on_both_sides() {
        // Regression guard. `MaildirFlags` renders in enum-declaration order
        // (P,R,S,T,D,F), not ASCII order, while the stored column is normalised
        // alphabetically. Comparing the raw rendering against the stored form
        // would report a change on every sync and rename every message forever,
        // silently defeating the no-op short-circuit.
        let rendered = maildir_flags_from_imap(&[Flag::Seen, Flag::Flagged]).to_string();
        assert_eq!(rendered, "SF", "io-maildir renders in enum order");
        assert_eq!(normalize_flags(&rendered), "FS", "stored form is alphabetical");
        assert_ne!(
            rendered,
            normalize_flags(&rendered),
            "the two forms genuinely differ, so the comparison must normalise"
        );
        // Normalising is idempotent, so applying it on both sides converges.
        assert_eq!(
            normalize_flags(&normalize_flags(&rendered)),
            normalize_flags(&rendered)
        );
    }

    #[test]
    fn imap_flags_map_each_known_flag_and_drop_the_rest() {
        let all = maildir_flags_from_imap(&[
            Flag::Seen,
            Flag::Answered,
            Flag::Flagged,
            Flag::Draft,
            Flag::Deleted,
        ])
        .to_string();
        assert_eq!(normalize_flags(&all), "DFRST", "all five map to letters");

        // A server keyword has no info-section letter, so it must not leak a
        // character into the filename (it would need a dovecot keyword slot).
        let keyword = Flag::Keyword("$Junk".try_into().unwrap());
        assert_eq!(maildir_flags_from_imap(&[keyword]).to_string(), "");
        assert_eq!(maildir_flags_from_imap(&[]).to_string(), "");
    }

    #[test]
    fn content_revision_is_stable_and_content_sensitive() {
        assert_eq!(content_revision(b"hello"), content_revision(b"hello"));
        assert_ne!(content_revision(b"hello"), content_revision(b"hello!"));
        // Hex sha256 is 64 chars — guards against a truncating format change.
        assert_eq!(content_revision(b"hello").len(), 64);
    }

    /// Deliver one message into a scratch maildir the same way
    /// [`ImapWorker::deliver_batch`] does, returning the client, maildir and the
    /// delivery result.
    fn deliver_one(
        root: &Path,
        mailbox: &str,
        body: &[u8],
        flags: &[Flag<'static>],
    ) -> (MaildirClient, io_maildir::maildir::Maildir, String, PathBuf) {
        let client =
            MaildirClient::new(MaildirFsPath::new(root.to_string_lossy().into_owned()));
        client.create_maildir(mailbox).unwrap();
        let maildir = client.load_maildir(mailbox).unwrap();
        let (id, path) = client
            .store(
                maildir.clone(),
                MaildirSubdir::Cur,
                maildir_flags_from_imap(flags),
                body.to_vec(),
            )
            .unwrap();
        (client, maildir, id, PathBuf::from(path.as_str()))
    }

    #[test]
    fn delivery_lands_complete_in_cur_and_leaves_tmp_empty() {
        let tmp = tempfile::tempdir().unwrap();
        let body = b"From: a@example.com\r\nSubject: hi\r\n\r\nbody\r\n";
        let (_client, _maildir, _id, path) =
            deliver_one(tmp.path(), "INBOX", body, &[Flag::Seen]);

        // The delivered file is in cur/, complete.
        assert!(path.starts_with(tmp.path().join("INBOX").join("cur")));
        assert_eq!(std::fs::read(&path).unwrap(), body);

        // tmp/ is the staging area for the delivery protocol; nothing may be
        // left behind once the rename has happened.
        let leftovers: Vec<_> = std::fs::read_dir(tmp.path().join("INBOX").join("tmp"))
            .unwrap()
            .map(|e| e.unwrap().file_name())
            .collect();
        assert!(leftovers.is_empty(), "tmp/ must be empty after delivery: {leftovers:?}");

        // Exactly one file in cur/ — no partial sibling.
        let cur: Vec<_> = std::fs::read_dir(tmp.path().join("INBOX").join("cur"))
            .unwrap()
            .map(|e| e.unwrap().path())
            .collect();
        assert_eq!(cur.len(), 1, "expected exactly one delivered file");
    }

    #[test]
    fn delivered_filename_is_not_derived_from_the_uid() {
        // The old scheme baked uidvalidity+uid+flags into the basename, which is
        // what made a flag change invalidate the state key. The replacement must
        // not reintroduce that coupling.
        let tmp = tempfile::tempdir().unwrap();
        let (_c, _m, id, path) = deliver_one(tmp.path(), "INBOX", b"x", &[]);
        let name = path.file_name().unwrap().to_string_lossy().into_owned();
        assert!(name.contains(&id), "filename should carry the delivery id");
        assert!(!name.contains("mailbrus"), "no uid-derived naming: {name}");
    }

    #[test]
    fn flag_change_preserves_the_identifier_and_renames_the_file() {
        let tmp = tempfile::tempdir().unwrap();
        let body = b"From: a@example.com\r\n\r\nbody\r\n";
        let (client, maildir, id, old_path) =
            deliver_one(tmp.path(), "INBOX", body, &[]);

        let seen: MaildirFlags = "S".chars().filter_map(MaildirFlag::from_char).collect();
        client.set_flags(maildir.clone(), &id, seen).unwrap();

        let (new_path, _, flags) = client.locate(maildir.clone(), &id).unwrap();
        let new_path = PathBuf::from(new_path.as_str());

        assert_ne!(old_path, new_path, "setting a flag must rename the file");
        assert!(!old_path.exists(), "the old filename must be gone");
        assert_eq!(normalize_flags(&flags.to_string()), "S");
        // Identity and content both survive — this is why the state row can be
        // updated in place instead of deleted and re-inserted.
        assert_eq!(std::fs::read(&new_path).unwrap(), body);
    }

    #[test]
    fn setting_identical_flags_does_not_change_the_filename() {
        // Backs the short-circuit: if flags match, we skip entirely. Even if we
        // did not, the rename would be a no-op — but skipping is what keeps a
        // CONDSTORE delta from re-indexing every reported message.
        let tmp = tempfile::tempdir().unwrap();
        let (client, maildir, id, path_before) =
            deliver_one(tmp.path(), "INBOX", b"body", &[Flag::Seen]);

        let same: MaildirFlags = "S".chars().filter_map(MaildirFlag::from_char).collect();
        client.set_flags(maildir.clone(), &id, same).unwrap();

        let (path_after, _, _) = client.locate(maildir, &id).unwrap();
        assert_eq!(
            path_before,
            PathBuf::from(path_after.as_str()),
            "re-applying the same flags must not rename"
        );
    }

    #[test]
    fn revision_detects_a_local_edit_and_the_rename_still_applies() {
        let tmp = tempfile::tempdir().unwrap();
        let body = b"From: a@example.com\r\n\r\noriginal\r\n";
        let (client, maildir, id, path) = deliver_one(tmp.path(), "INBOX", body, &[]);

        let recorded = content_revision(body);
        assert_eq!(
            content_revision(&std::fs::read(&path).unwrap()),
            recorded,
            "an untouched message matches its recorded revision"
        );

        // Simulate a local edit.
        std::fs::write(&path, b"From: a@example.com\r\n\r\nEDITED\r\n").unwrap();
        let after_edit = content_revision(&std::fs::read(&path).unwrap());
        assert_ne!(after_edit, recorded, "divergence must be detectable");

        // A flag change is still applied: a rename preserves content, and
        // skipping would wedge the mailbox since the server keeps reporting the
        // UID as changed.
        let seen: MaildirFlags = "S".chars().filter_map(MaildirFlag::from_char).collect();
        client.set_flags(maildir.clone(), &id, seen).unwrap();
        let (new_path, _, _) = client.locate(maildir, &id).unwrap();
        let new_path = PathBuf::from(new_path.as_str());

        assert_eq!(
            std::fs::read(&new_path).unwrap(),
            b"From: a@example.com\r\n\r\nEDITED\r\n",
            "the local edit must survive the flag rename"
        );
        // Re-baselining to the on-disk content is what stops the warning
        // repeating on every subsequent sync.
        assert_eq!(content_revision(&std::fs::read(&new_path).unwrap()), after_edit);
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
