pub mod maildirs;
pub mod messages;
pub mod push;
pub mod sync;

use axum::{http::StatusCode, response::{IntoResponse, Response}, Json};
use mailbrus_core::{maildir_reader::MaildirReader, MailboxError};
use serde_json::json;

pub fn json_error(status: StatusCode, msg: &str) -> Response {
    (status, Json(json!({"error": msg}))).into_response()
}

/// Whether a read error is a transient effect of a concurrent sync committing
/// to the notmuch database (Xapian "database modified" / lock), as opposed to a
/// real failure. Such errors clear once a fresh handle reopens the database.
fn is_transient(e: &MailboxError) -> bool {
    match e {
        MailboxError::DatabaseLocked => true,
        MailboxError::DatabaseCorrupted(m) | MailboxError::QueryFailed(m) => {
            let m = m.to_lowercase();
            m.contains("modified") || m.contains("reopen") || m.contains("lock") || m.contains("changed")
        }
        _ => false,
    }
}

/// Open the notmuch database and run a read closure, reopening and retrying a
/// few times on transient errors. A `mailbrus sync` (or the in-app trigger)
/// holds the database open ReadWrite while indexing; without this a read that
/// races a commit would surface as an error and the UI would render an empty
/// mailbox. Intended to run inside `spawn_blocking`.
pub fn read_with_retry<T>(
    f: impl Fn(&MaildirReader) -> Result<T, MailboxError>,
) -> Result<T, MailboxError> {
    let mut attempt = 0u32;
    loop {
        match MaildirReader::open().and_then(|r| f(&r)) {
            Ok(v) => return Ok(v),
            Err(e) if is_transient(&e) && attempt < 5 => {
                attempt += 1;
                std::thread::sleep(std::time::Duration::from_millis(40 * attempt as u64));
            }
            Err(e) => return Err(e),
        }
    }
}
