pub mod error;
pub mod maildir_reader;
pub use error::MailboxError;

#[cfg(feature = "sync")]
pub mod config;

#[cfg(feature = "sync")]
pub mod connection_test;

#[cfg(feature = "sync")]
pub mod credentials;

#[cfg(feature = "sync")]
pub mod notmuch_db;

#[cfg(feature = "sync")]
pub mod sync;

/// Returns the mailbrus version string.
///
/// ```
/// assert!(!mailbrus_core::version().is_empty());
/// ```
pub fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}
