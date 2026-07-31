//! Connection validation for new accounts.
//!
//! Tests IMAP login and SMTP AUTH without delivering any message.
//! Used by `POST /api/accounts` before persisting a new account.

use std::sync::Arc;
use std::time::Duration;

use base64::Engine;
use imap_client::client::tokio::Client as ImapClient;
use thiserror::Error;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpStream;
use tokio::time::timeout;
use tracing::debug;

use crate::config::ImapConfig;

const TEST_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Debug, Error)]
pub enum ConnectionTestError {
    #[error("IMAP connection failed: {0}")]
    ImapConnect(String),
    #[error("IMAP authentication failed: {0}")]
    ImapAuth(String),
    #[error("SMTP connection failed: {0}")]
    SmtpConnect(String),
    #[error("SMTP authentication failed: {0}")]
    SmtpAuth(String),
    #[error("connection timed out after {secs}s")]
    Timeout { secs: u64 },
}

/// Validate IMAP login and (if `smtp_host` is configured) SMTP AUTH.
///
/// Returns `Ok(())` when both succeed. Returns a typed error naming the failing side.
pub async fn test_connection(imap: &ImapConfig, secret: &str) -> Result<(), ConnectionTestError> {
    // IMAP test
    timeout(TEST_TIMEOUT, test_imap(imap, secret))
        .await
        .map_err(|_| ConnectionTestError::Timeout { secs: TEST_TIMEOUT.as_secs() })??;

    // SMTP test — only when an SMTP host is configured.
    if let Some(smtp_host) = &imap.smtp_host {
        let host = smtp_host.clone();
        let port = imap.resolved_smtp_port();
        let starttls = imap.resolved_smtp_starttls();
        let user = imap.email.clone();
        let pass = secret.to_string();

        timeout(TEST_TIMEOUT, test_smtp(&host, port, starttls, &user, &pass))
            .await
            .map_err(|_| ConnectionTestError::Timeout { secs: TEST_TIMEOUT.as_secs() })??;
    }

    Ok(())
}

async fn test_imap(imap: &ImapConfig, secret: &str) -> Result<(), ConnectionTestError> {
    let mut client = if imap.imap_tls {
        ImapClient::rustls(&imap.imap_host, imap.imap_port, false, None).await
    } else {
        ImapClient::insecure(&imap.imap_host, imap.imap_port).await
    }
    .map_err(|e| ConnectionTestError::ImapConnect(e.to_string()))?;

    // Prefer SASL PLAIN; fall back to LOGIN (mirrors the sync worker).
    let auth_result = client.authenticate_plain(&imap.email, secret).await;
    if let Err(auth_err) = auth_result {
        client
            .login(imap.email.as_str(), secret)
            .await
            .map_err(|login_err| {
                ConnectionTestError::ImapAuth(format!(
                    "AUTHENTICATE PLAIN: {auth_err}; LOGIN: {login_err}"
                ))
            })?;
    }

    debug!(account = %imap.email, "IMAP connection test passed");
    // Don't LOGOUT — just drop the client. Most IMAP servers handle abrupt close gracefully.
    Ok(())
}

/// Minimal SMTP AUTH test: connect, EHLO, optional STARTTLS, AUTH PLAIN, QUIT.
async fn test_smtp(
    host: &str,
    port: u16,
    starttls: bool,
    user: &str,
    pass: &str,
) -> Result<(), ConnectionTestError> {
    let stream = TcpStream::connect((host, port))
        .await
        .map_err(|e| ConnectionTestError::SmtpConnect(e.to_string()))?;

    if starttls {
        test_smtp_starttls(stream, host, port, user, pass).await
    } else {
        test_smtp_plain(stream, user, pass).await
    }
}

async fn test_smtp_plain(
    stream: TcpStream,
    user: &str,
    pass: &str,
) -> Result<(), ConnectionTestError> {
    let (reader_half, mut writer) = tokio::io::split(stream);
    let mut reader = BufReader::new(reader_half);

    smtp_handshake_and_auth(&mut reader, &mut writer, user, pass).await
}

async fn test_smtp_starttls(
    stream: TcpStream,
    host: &str,
    _port: u16,
    user: &str,
    pass: &str,
) -> Result<(), ConnectionTestError> {
    use tokio_rustls::TlsConnector;
    use tokio_rustls::rustls;
    use rustls_platform_verifier::BuilderVerifierExt;

    let (reader_half, mut writer) = tokio::io::split(stream);
    let mut reader = BufReader::new(reader_half);

    // Read greeting.
    read_smtp_response(&mut reader)
        .await
        .map_err(ConnectionTestError::SmtpConnect)?;

    // EHLO — get server capabilities.
    writer
        .write_all(b"EHLO mailbrus\r\n")
        .await
        .map_err(|e| ConnectionTestError::SmtpConnect(e.to_string()))?;

    let ehlo_response = read_smtp_response(&mut reader)
        .await
        .map_err(ConnectionTestError::SmtpConnect)?;

    let (ehlo_code, _) = ehlo_response;
    if ehlo_code != 250 {
        return Err(ConnectionTestError::SmtpConnect(format!(
            "EHLO returned {ehlo_code}"
        )));
    }

    // Request STARTTLS.
    writer
        .write_all(b"STARTTLS\r\n")
        .await
        .map_err(|e| ConnectionTestError::SmtpConnect(e.to_string()))?;

    let (starttls_code, starttls_msg) = read_smtp_response(&mut reader)
        .await
        .map_err(ConnectionTestError::SmtpConnect)?;

    if starttls_code != 220 {
        return Err(ConnectionTestError::SmtpConnect(format!(
            "STARTTLS: server responded {starttls_code}: {starttls_msg}"
        )));
    }

    // Reassemble the original stream.
    let plain_stream = reader.into_inner().unsplit(writer);

    // Upgrade to TLS.
    let config = rustls::ClientConfig::builder()
        .with_platform_verifier()
        .map_err(|e| ConnectionTestError::SmtpConnect(format!("TLS config: {e}")))?
        .with_no_client_auth();
    let connector = TlsConnector::from(Arc::new(config));
    let server_name = rustls::pki_types::ServerName::try_from(host.to_owned())
        .map_err(|e| ConnectionTestError::SmtpConnect(format!("invalid hostname: {e}")))?;

    let tls_stream = connector
        .connect(server_name, plain_stream)
        .await
        .map_err(|e| ConnectionTestError::SmtpConnect(format!("TLS handshake: {e}")))?;

    let (tls_reader, mut tls_writer) = tokio::io::split(tls_stream);
    let mut tls_buf_reader = BufReader::new(tls_reader);

    // Post-TLS EHLO.
    tls_writer
        .write_all(b"EHLO mailbrus\r\n")
        .await
        .map_err(|e| ConnectionTestError::SmtpConnect(e.to_string()))?;
    let (code, msg) = read_smtp_response(&mut tls_buf_reader)
        .await
        .map_err(ConnectionTestError::SmtpConnect)?;
    if code != 250 {
        return Err(ConnectionTestError::SmtpConnect(format!(
            "post-TLS EHLO: {code}: {msg}"
        )));
    }

    smtp_auth(&mut tls_buf_reader, &mut tls_writer, user, pass).await
}

/// Perform the initial SMTP exchange (greeting + EHLO) and AUTH on a plain stream.
async fn smtp_handshake_and_auth<R, W>(
    reader: &mut BufReader<R>,
    writer: &mut W,
    user: &str,
    pass: &str,
) -> Result<(), ConnectionTestError>
where
    R: tokio::io::AsyncRead + Unpin,
    W: tokio::io::AsyncWrite + Unpin,
{
    // Greeting.
    read_smtp_response(reader)
        .await
        .map_err(ConnectionTestError::SmtpConnect)?;

    // EHLO.
    writer
        .write_all(b"EHLO mailbrus\r\n")
        .await
        .map_err(|e| ConnectionTestError::SmtpConnect(e.to_string()))?;
    let (code, msg) = read_smtp_response(reader)
        .await
        .map_err(ConnectionTestError::SmtpConnect)?;
    if code != 250 {
        return Err(ConnectionTestError::SmtpConnect(format!(
            "EHLO: {code}: {msg}"
        )));
    }

    smtp_auth(reader, writer, user, pass).await
}

async fn smtp_auth<R, W>(
    reader: &mut BufReader<R>,
    writer: &mut W,
    user: &str,
    pass: &str,
) -> Result<(), ConnectionTestError>
where
    R: tokio::io::AsyncRead + Unpin,
    W: tokio::io::AsyncWrite + Unpin,
{
    // AUTH PLAIN: base64("\0user\0pass")
    let auth_payload =
        base64::engine::general_purpose::STANDARD.encode(format!("\0{user}\0{pass}"));
    let auth_cmd = format!("AUTH PLAIN {auth_payload}\r\n");

    writer
        .write_all(auth_cmd.as_bytes())
        .await
        .map_err(|e| ConnectionTestError::SmtpAuth(e.to_string()))?;

    let (code, msg) = read_smtp_response(reader)
        .await
        .map_err(ConnectionTestError::SmtpAuth)?;

    if code == 235 {
        debug!(?user, "SMTP AUTH test passed");
        // QUIT gracefully.
        let _ = writer.write_all(b"QUIT\r\n").await;
        Ok(())
    } else {
        Err(ConnectionTestError::SmtpAuth(format!(
            "server responded {code}: {msg}"
        )))
    }
}

/// Read a (possibly multi-line) SMTP response and return `(final_code, last_line_text)`.
#[allow(unused_assignments)]
async fn read_smtp_response<R: tokio::io::AsyncRead + Unpin>(
    reader: &mut BufReader<R>,
) -> Result<(u16, String), String> {
    let mut code = 0u16;
    let mut text = String::new();
    loop {
        let mut line = String::new();
        reader
            .read_line(&mut line)
            .await
            .map_err(|e| e.to_string())?;
        if line.len() < 4 {
            return Err(format!("truncated SMTP response: {line:?}"));
        }
        code = line[..3]
            .parse()
            .map_err(|_| format!("invalid SMTP response code: {line:?}"))?;
        let is_last = matches!(line.as_bytes().get(3), Some(b' ') | None);
        text = line[4..].trim_end().to_string();
        if is_last {
            break;
        }
    }
    Ok((code, text))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{CredentialBackend, ImapConfig};
    use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
    use tokio::net::TcpListener;

    fn imap_cfg(host: &str, port: u16) -> ImapConfig {
        ImapConfig {
            email: "test@test.local".to_string(),
            display_name: None,
            imap_host: host.to_string(),
            imap_port: port,
            imap_tls: false,
            credential_backend: CredentialBackend::Plain,
            credential_ref: "secret".to_string(),
            maildir_root: None,
            pass_gpg_backend: None,
            smtp_host: None,
            smtp_port: None,
            smtp_starttls: None,
            signature: None,
        }
    }

    /// Spawn a local TCP listener that sends an IMAP greeting and rejects every
    /// AUTH/LOGIN attempt with `NO`. Returns the bound port.
    async fn spawn_reject_auth_imap() -> u16 {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        tokio::spawn(async move {
            if let Ok((stream, _)) = listener.accept().await {
                let (reader_half, mut writer) = tokio::io::split(stream);
                let mut reader = BufReader::new(reader_half);

                writer.write_all(b"* OK IMAP4rev1 ready\r\n").await.ok();

                let mut line = String::new();
                loop {
                    line.clear();
                    match reader.read_line(&mut line).await {
                        Ok(0) | Err(_) => break,
                        Ok(_) => {}
                    }
                    let trimmed = line.trim_end();
                    if trimmed.is_empty() {
                        continue;
                    }
                    let tag = trimmed.split_whitespace().next().unwrap_or("*");
                    let upper = trimmed.to_uppercase();
                    let resp = if upper.contains("CAPABILITY") {
                        format!("* CAPABILITY IMAP4rev1 AUTH=PLAIN\r\n{tag} OK capability\r\n")
                    } else {
                        format!("{tag} NO Authentication failed\r\n")
                    };
                    if writer.write_all(resp.as_bytes()).await.is_err() {
                        break;
                    }
                }
            }
        });
        port
    }

    #[tokio::test]
    async fn connection_refused_returns_imap_connect_error() {
        // Port 1 is reserved and never open; connection will be refused immediately.
        let cfg = imap_cfg("127.0.0.1", 1);
        let err = test_connection(&cfg, "any-secret").await.unwrap_err();
        assert!(
            matches!(err, ConnectionTestError::ImapConnect(_)),
            "expected ImapConnect, got {err:?}"
        );
    }

    #[tokio::test]
    async fn auth_failure_returns_imap_auth_error() {
        let port = spawn_reject_auth_imap().await;
        let cfg = imap_cfg("127.0.0.1", port);
        let err = test_connection(&cfg, "wrong-password").await.unwrap_err();
        assert!(
            matches!(err, ConnectionTestError::ImapAuth(_)),
            "expected ImapAuth, got {err:?}"
        );
    }
}
