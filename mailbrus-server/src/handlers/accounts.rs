use super::json_error;
use axum::{
    extract::State,
    http::{HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use mailbrus_core::config::{CredentialBackend, ImapConfig};
use mailbrus_core::connection_test::test_connection;
use mailbrus_core::credentials;
use serde::{Deserialize, Serialize};
use tracing::{debug, warn};

use crate::state::AppState;

// ─── response shapes ────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct AccountSummary {
    pub id: String,
    pub email: String,
    pub protocol: &'static str,
    pub display_name: Option<String>,
}

impl AccountSummary {
    fn from_imap(id: &str, imap: &ImapConfig) -> Self {
        Self {
            id: id.to_string(),
            email: imap.email.clone(),
            protocol: "imap",
            display_name: imap.display_name.clone(),
        }
    }
}

// ─── request shape ──────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct CreateAccountBody {
    pub email: String,
    pub display_name: Option<String>,
    pub imap_host: String,
    pub imap_port: u16,
    pub imap_tls: bool,
    pub smtp_host: Option<String>,
    pub smtp_port: Option<u16>,
    pub smtp_starttls: Option<bool>,
    pub credential_backend: CredentialBackend,
    pub secret: String,
    pub signature: Option<String>,
}

// ─── handlers ───────────────────────────────────────────────────────────────

/// `GET /api/accounts` — list configured accounts (never includes secrets).
pub async fn list_accounts(State(state): State<AppState>) -> Response {
    debug!("[api] GET /api/accounts");
    let accounts = state.accounts();
    let summaries: Vec<AccountSummary> = accounts
        .iter()
        .filter_map(|a| a.imap().map(|imap| AccountSummary::from_imap(&a.id, imap)))
        .collect();

    let mut response = Json(summaries).into_response();
    response
        .headers_mut()
        .insert("Cache-Control", HeaderValue::from_static("no-store"));
    response
}

/// `POST /api/accounts` — validate and create a new account.
///
/// - `409` if an account with that email already exists.
/// - `422` if IMAP/SMTP validation fails (field + reason in body).
/// - `201` with account summary on success; also triggers `reload_accounts()`.
pub async fn create_account(
    State(state): State<AppState>,
    Json(body): Json<CreateAccountBody>,
) -> Response {
    debug!("[api] POST /api/accounts email={}", body.email);

    // 1. Reject duplicate (check before doing any network I/O).
    let existing = state.accounts();
    if existing.iter().any(|a| a.id == body.email) {
        return (
            StatusCode::CONFLICT,
            Json(serde_json::json!({ "error": "account already exists", "field": "email" })),
        )
            .into_response();
    }

    // 2. Build a temporary ImapConfig for the connection test (credential_ref is the email).
    let test_imap = ImapConfig {
        email: body.email.clone(),
        display_name: body.display_name.clone(),
        imap_host: body.imap_host.clone(),
        imap_port: body.imap_port,
        imap_tls: body.imap_tls,
        credential_backend: body.credential_backend,
        credential_ref: body.email.clone(), // placeholder — actual ref stored after validation
        maildir_root: None,
        pass_gpg_backend: None,
        smtp_host: body.smtp_host.clone(),
        smtp_port: body.smtp_port,
        smtp_starttls: body.smtp_starttls,
        signature: body.signature.clone(),
    };

    // 3. Validate credentials against the real servers.
    if let Err(e) = test_connection(&test_imap, &body.secret).await {
        use mailbrus_core::connection_test::ConnectionTestError;
        let (field, reason) = match &e {
            ConnectionTestError::ImapConnect(_) | ConnectionTestError::ImapAuth(_) => {
                ("imap_host", e.to_string())
            }
            ConnectionTestError::SmtpConnect(_) | ConnectionTestError::SmtpAuth(_) => {
                ("smtp_host", e.to_string())
            }
            ConnectionTestError::Timeout { .. } => ("imap_host", e.to_string()),
        };
        warn!("[api] POST /api/accounts validation failed for {}: {e}", body.email);
        return (
            StatusCode::UNPROCESSABLE_ENTITY,
            Json(serde_json::json!({ "error": reason, "field": field })),
        )
            .into_response();
    }

    // 4. Store the credential, get back the credential_ref to persist.
    let credential_ref =
        match credentials::write(&body.email, body.credential_backend, &body.secret).await {
            Ok(r) => r,
            Err(e) => {
                warn!("[api] POST /api/accounts credential write failed: {e}");
                return json_error(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string());
            }
        };

    // 5. Write the account file atomically.
    let final_imap = ImapConfig { credential_ref, ..test_imap };
    let base_dir = state
        .config_base_dir
        .clone()
        .or_else(|| dirs::config_dir().map(|d| d.join("mailbrus")));

    let base_dir = match base_dir {
        Some(d) => d,
        None => return json_error(StatusCode::INTERNAL_SERVER_ERROR, "cannot resolve config dir"),
    };

    if let Err(e) = mailbrus_core::config::write_account(&base_dir, &final_imap, &body.email) {
        use mailbrus_core::config::ConfigError;
        match e {
            ConfigError::AlreadyExists { .. } => {
                return (
                    StatusCode::CONFLICT,
                    Json(
                        serde_json::json!({ "error": "account already exists", "field": "email" }),
                    ),
                )
                    .into_response();
            }
            _ => {
                warn!("[api] POST /api/accounts write failed: {e}");
                return json_error(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string());
            }
        }
    }

    // 6. Reload the account registry so the new account is live.
    state.reload_accounts();

    // 7. Respond 201 with the account summary.
    let summary = AccountSummary::from_imap(&body.email, &final_imap);
    let mut response =
        (StatusCode::CREATED, Json(summary)).into_response();
    response
        .headers_mut()
        .insert("Cache-Control", HeaderValue::from_static("no-store"));
    response
}
