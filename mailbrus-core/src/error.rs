use std::{fmt, io, path::PathBuf};

#[derive(Debug)]
pub enum MailboxError {
    DatabaseNotFound { path: PathBuf },
    DatabaseLocked,
    DatabaseCorrupted(String),
    MessageNotFound { id: String },
    BodyReadFailed { path: PathBuf, reason: io::Error },
    QueryFailed(String),
}

impl fmt::Display for MailboxError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::DatabaseNotFound { path } => {
                write!(f, "notmuch database not found at {}", path.display())
            }
            Self::DatabaseLocked => write!(f, "notmuch database is locked"),
            Self::DatabaseCorrupted(msg) => write!(f, "notmuch database corrupted: {msg}"),
            Self::MessageNotFound { id } => write!(f, "message not found: {id}"),
            Self::BodyReadFailed { path, reason } => {
                write!(f, "failed to read {}: {reason}", path.display())
            }
            Self::QueryFailed(msg) => write!(f, "query failed: {msg}"),
        }
    }
}

impl std::error::Error for MailboxError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        if let Self::BodyReadFailed { reason, .. } = self {
            Some(reason)
        } else {
            None
        }
    }
}

impl From<notmuch::Error> for MailboxError {
    fn from(err: notmuch::Error) -> Self {
        use notmuch::{Error as NE, Status};
        match err {
            NE::NotmuchError(Status::PathError) | NE::NotmuchVerboseError(Status::PathError, _) => {
                Self::DatabaseNotFound { path: PathBuf::new() }
            }
            NE::NotmuchError(Status::XapianException) => {
                Self::DatabaseCorrupted("xapian exception".to_string())
            }
            NE::NotmuchVerboseError(Status::XapianException, msg) => {
                if msg.to_lowercase().contains("lock") {
                    Self::DatabaseLocked
                } else {
                    Self::DatabaseCorrupted(msg)
                }
            }
            NE::IoError(e) => Self::QueryFailed(e.to_string()),
            e => Self::QueryFailed(e.to_string()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn display_database_not_found() {
        let err = MailboxError::DatabaseNotFound { path: PathBuf::from("/tmp/test") };
        assert!(err.to_string().contains("/tmp/test"));
    }

    #[test]
    fn display_database_locked() {
        assert!(!MailboxError::DatabaseLocked.to_string().is_empty());
    }

    #[test]
    fn display_database_corrupted() {
        let err = MailboxError::DatabaseCorrupted("bad checksum".to_string());
        assert!(err.to_string().contains("bad checksum"));
    }

    #[test]
    fn display_message_not_found() {
        let err = MailboxError::MessageNotFound { id: "abc123".to_string() };
        assert!(err.to_string().contains("abc123"));
    }

    #[test]
    fn display_body_read_failed() {
        let err = MailboxError::BodyReadFailed {
            path: PathBuf::from("/tmp/msg"),
            reason: io::Error::new(io::ErrorKind::NotFound, "not found"),
        };
        assert!(err.to_string().contains("/tmp/msg"));
    }

    #[test]
    fn display_query_failed() {
        let err = MailboxError::QueryFailed("syntax error".to_string());
        assert!(err.to_string().contains("syntax error"));
    }
}
