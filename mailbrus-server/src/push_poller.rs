use crate::state::{AppState, PushSubscription};
use mailbrus_core::{
    maildir_reader::{MaildirReader, PaginationOpts, SortBy},
    MailboxError,
};
use tracing::{debug, info, warn};

pub fn spawn_push_poller(state: AppState) {
    tokio::spawn(async move {
        info!("[push-poller] started polling for new messages");
        let mut seen: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(60)).await;

            let subs: Vec<PushSubscription> = state
                .push_subscriptions
                .lock()
                .unwrap()
                .values()
                .cloned()
                .collect();

            if subs.is_empty() {
                debug!("[push-poller] no active subscriptions, skipping poll");
                continue;
            }

            let result = tokio::task::spawn_blocking(|| {
                let reader = MaildirReader::open()?;
                let maildirs = reader.list_maildirs()?;
                Ok::<_, MailboxError>(maildirs)
            })
            .await;

            let maildirs = match result {
                Ok(Ok(m)) => m,
                Err(e) => {
                    warn!("[push-poller] task error: {}", e);
                    continue;
                }
                Ok(Err(e)) => {
                    warn!("[push-poller] error listing maildirs: {}", e);
                    continue;
                }
            };

            debug!(
                "[push-poller] checking {} maildir(s) for new messages",
                maildirs.len()
            );

            for maildir in maildirs {
                let id = maildir
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("")
                    .to_string();
                let opts = PaginationOpts { limit: 1, offset: 0 };
                let query = format!("folder:\"{id}/INBOX\"");
                let total = {
                    let q2 = query.clone();
                    tokio::task::spawn_blocking(move || {
                        MaildirReader::open()
                            .and_then(|r| r.list_messages(&q2, SortBy::Newest, opts))
                            .map(|(_, t)| t)
                    })
                    .await
                    .ok()
                    .and_then(|r| r.ok())
                    .unwrap_or(0)
                };

                let prev = *seen.get(&id).unwrap_or(&total);
                if total > prev {
                    let new_count = total - prev;
                    info!("[push-poller] {} new messages for account {}", new_count, id);
                    let account_subs: Vec<_> = subs
                        .iter()
                        .filter(|s| s.account == id || s.account.is_empty())
                        .collect();
                    for sub in account_subs {
                        debug!(
                            "[push-poller] sending notification to {}",
                            &sub.endpoint[..sub.endpoint.len().min(40)]
                        );
                    }
                }
                seen.insert(id, total);
            }
        }
    });
}
