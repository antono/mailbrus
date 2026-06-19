## ADDED Requirements

### Requirement: Zero-account state renders the onboarding wizard

When the application has no configured accounts, the SPA SHALL render the
account-editing component as a full-window onboarding wizard instead of the
mailbox view. The empty state SHALL be determined from `GET /api/accounts`
returning an empty list, NOT from `GET /api/maildirs` (which is empty until the
first sync even for a configured account).

#### Scenario: First launch with no accounts shows the wizard

- **WHEN** the SPA loads and `GET /api/accounts` returns `[]`
- **THEN** the onboarding wizard is rendered in the main window
- **AND** the empty mailbox / folder views are not shown

#### Scenario: Configured-but-unsynced account does not re-show the wizard

- **WHEN** `GET /api/accounts` returns one or more accounts but `GET /api/maildirs`
  is still empty (no sync has completed yet)
- **THEN** the wizard is NOT shown
- **AND** the mailbox view is rendered

### Requirement: Wizard collects the fields for one IMAP account

The wizard SHALL present a form collecting the fields needed to define a single
IMAP account: email address, optional display name, IMAP host, IMAP port, IMAP
TLS, SMTP host, SMTP port, SMTP STARTTLS, credential backend, the secret, and an
optional multi-line signature/footer. The account id is the email address and is
not entered separately.

#### Scenario: Form exposes all account fields

- **WHEN** the wizard is shown
- **THEN** the form exposes inputs for email, display name, IMAP host/port/TLS,
  SMTP host/port/STARTTLS, credential backend, secret, and a signature textarea

#### Scenario: Only keyring and plain credential backends are offered

- **WHEN** the user selects a credential backend in the wizard
- **THEN** only `keyring` (default) and `plain` are selectable
- **AND** choosing `plain` displays a warning that the secret is stored unencrypted

### Requirement: Submitting the wizard creates the account

On submit the wizard SHALL `POST /api/accounts` with the collected fields and the
secret. On success (`201`) it SHALL advance to the post-create step. On a
validation failure (`422`) it SHALL display the returned field and reason inline
without losing the entered values. On a duplicate id (`409`) it SHALL indicate the
account already exists.

#### Scenario: Valid submission creates the account

- **WHEN** the user submits valid settings whose servers authenticate
- **THEN** the wizard receives `201` and shows the post-create step

#### Scenario: Invalid settings are surfaced inline

- **WHEN** submission returns `422` naming a field and reason
- **THEN** the wizard shows that error against the relevant field
- **AND** the previously entered values remain in the form

#### Scenario: Duplicate account is reported

- **WHEN** submission returns `409` because an account with that email exists
- **THEN** the wizard reports that the account already exists

### Requirement: Post-create flow offers Sync now then Go to inbox

After a successful create the wizard SHALL NOT auto-sync. It SHALL show a
**Sync now** action that triggers `POST /api/sync/<id>`. Once the first message
for the account has been fetched and indexed (observed via `GET /api/sync/stream`
and/or a non-empty `GET /api/maildirs`), the wizard SHALL show a **Go to inbox**
action that navigates into the mailbox view.

#### Scenario: Sync now triggers synchronization

- **WHEN** the account is created and the user clicks **Sync now**
- **THEN** the SPA issues `POST /api/sync/<id>` for the new account

#### Scenario: Go to inbox appears after first message indexed

- **WHEN** the first message has been fetched and indexed for the new account
- **THEN** the wizard shows a **Go to inbox** action
- **AND** activating it navigates into the mailbox view

### Requirement: New messages include the account signature

When the account defines a signature, composing a new message SHALL prefill the
message body with the signature placed after a delimiter line containing exactly
`-- ` (dash, dash, space) on its own line, so the author can see and edit it
before sending.

#### Scenario: Compose prefills the signature with the standard delimiter

- **WHEN** the user starts a new message for an account whose signature is set
- **THEN** the compose body is prefilled with the signature preceded by a line
  containing exactly `-- ` (dash, dash, space) on its own line

#### Scenario: No signature configured leaves the body empty

- **WHEN** the account has no signature
- **THEN** the compose body is not prefilled with a delimiter or footer
