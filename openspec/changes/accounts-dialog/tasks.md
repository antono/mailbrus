## 1. mailbrus-core — per-account config model (BREAKING)

- [x] 1.1 Add SMTP fields to the account entry: `smtp_host: Option<String>`, `smtp_port: Option<u16>` (default `587`), `smtp_starttls: Option<bool>` (default `true`), exposing resolved defaults via accessors.
- [x] 1.2 Add optional `signature: Option<String>` (multi-line) to the account entry.
- [x] 1.3 Make `id` equal the email address and treat the per-account filename stem as the id; update `default_maildir_root` to key on the email (`$XDG_DATA_HOME/mailbrus/mail/<email>/`).
- [x] 1.4 Rewrite `load_config` to scan `$XDG_CONFIG_HOME/mailbrus/accounts/` (fallback `~/.config/mailbrus/accounts/`), parsing each `*.toml` as one account with fields at the top level (no `[accounts.<id>]` wrapper); stop reading `config.toml`.
- [x] 1.5 On a malformed/incomplete account file, skip it with a warning naming the file and continue loading the rest; absent/empty dir returns an empty list with a warning.
- [x] 1.6 Honor an explicit config-location override by scanning `<override>/accounts/` instead of the XDG default.
- [x] 1.7 Unit tests: dir scan loads N accounts, id = filename stem, malformed file skipped, empty/absent dir, SMTP defaults applied, signature parsed verbatim.

## 2. mailbrus-core — account + credential write

- [x] 2.1 Add a per-account write helper that serializes an account to `accounts/<email>.toml` atomically (temp file in same dir → `fsync` → rename).
- [x] 2.2 Refuse to overwrite: the write fails with a distinct "already exists" error when `accounts/<email>.toml` exists, leaving the file untouched.
- [x] 2.3 Add a credential write path: `keyring` stores the secret via `keyring::Entry::set_password` under `credential_ref` = email; `plain` writes inline to the file; `pass` is never written.
- [x] 2.4 Add a signature-application helper that appends `\r\n-- \r\n<signature>` to a plain-text body and emits the `-- ` delimiter line as-is under `format=flowed`.
- [x] 2.5 Add a connection-test function (no message sent): IMAP login using the resolved credential, and SMTP `AUTH` against the SMTP settings; bounded by a timeout, returning a typed error naming the failing side.
- [x] 2.6 Unit tests: atomic write round-trips, overwrite refused, keyring round-trip via `credentials::resolve`, signature delimiter is exactly `-- ` (dash, dash, space), connection-test success and auth-failure paths.

## 3. mailbrus-server — reloadable state + account endpoints

- [x] 3.1 Make `AppState` account list and `sync_engine` swappable (`arc_swap::ArcSwap` or `Mutex<Arc<…>>`); add an accessor and update existing handlers to read accounts/engine per request rather than from a captured snapshot.
- [x] 3.2 Add `reload_accounts()` that re-runs the startup wiring (load accounts → resolve maildir roots → register in notmuch → build `SyncEngine`) and atomically swaps the new state in; the zero→one transition builds the engine that was `None`.
- [x] 3.3 Implement `GET /api/accounts` returning account summaries (`id`, `email`, `protocol`, `display_name`), never including the secret; empty list when none configured.
- [x] 3.4 Implement `POST /api/accounts`: parse the body, validate via the core connection-test (timeout → `422`), reject duplicates with `409`, store the credential, write the account file, call `reload_accounts()`, and respond `201` with the summary.
- [x] 3.5 Register both routes in `main.rs`; ensure the email-as-id is percent-encoded/decoded consistently where it appears in route paths, and that `/api/accounts` carries `Cache-Control: no-store`.
- [x] 3.6 Update the startup path so an empty `accounts/` directory starts the server with an empty registry (no panic) and logs the existing zero-accounts warning.

## 4. Frontend — data layer, wizard, signature

- [x] 4.1 Add `getAccounts()` (`GET /api/accounts`) and `createAccount(payload)` (`POST /api/accounts`) to `src/lib/api.ts`, with typed account summary + create-error shapes.
- [x] 4.2 Branch the main window: when `getAccounts()` returns `[]`, render the onboarding wizard instead of the mailbox view (do not key this off `/api/maildirs`).
- [x] 4.3 Build the `OnboardingWizard` Svelte component (Svelte 5 runes) with inputs for email, display name, IMAP host/port/TLS, SMTP host/port/STARTTLS, credential backend (keyring default; `plain` shows an unencrypted-storage warning), secret, and a signature textarea; add `data-testid` attributes per the repo convention.
- [x] 4.4 Wire submit: on `201` advance to the post-create step; on `422` show the returned field/reason inline without clearing inputs; on `409` report the account already exists.
- [x] 4.5 Post-create step: a **Sync now** action issuing `POST /api/sync/<id>`, then a **Go to inbox** action that appears once the first message is fetched and indexed (observed via `/api/sync/stream` and/or a non-empty `/api/maildirs`) and navigates into the mailbox.
- [x] 4.6 In Compose, prefill a new message body with the current account's signature after a line containing exactly `-- ` (dash, dash, space); leave the body empty when no signature is set.

## 5. E2E test validation and fixes

- [x] 5.1 Extend the e2e harness/fixtures so a test can start `mailbrus-server` with an empty `accounts/` directory (zero-account onboarding state).
- [x] 5.2 Author an onboarding spec under `e2e/` (using the mailbrus-e2e-author skill): empty accounts → wizard shown → fill valid settings → create → **Sync now** → **Go to inbox** → mailbox renders; add a page object + manifest entry, `data-testid` selectors, and the mandatory `// openspec/...` reference comment.
- [x] 5.3 Add negative-path coverage: invalid credentials surface `422` inline; creating a duplicate account surfaces `409`.
- [x] 5.4 Run `deno task test:e2e`; debug failures via retained traces (`deno task e2e:debug`) and fix until the suite passes.

## 6. Cleanup

- [x] 6.1 Run `cargo build --workspace` and `cargo clippy --workspace`; fix all compilation warnings introduced by this change (including any from removing the legacy `config.toml` path).
- [x] 6.2 Run the frontend type/lint checks (`deno task check` / svelte-check) and resolve any warnings in the new component and data-layer code.

## 7. UX polish

- [x] 7.1 Hide the `.mb-status` sync status bar while the onboarding wizard is visible; show it only after the user navigates to the mailbox (i.e., move `<StatusBar />` from `+layout.svelte` into the `{:else}` branch of the `showWizard` conditional in `+page.svelte`).
- [x] 7.2 Add well-known provider presets to `OnboardingWizard`: a dropdown for Gmail, Outlook/Hotmail, Yahoo Mail, iCloud, and Fastmail that auto-fills all IMAP/SMTP fields; user only needs to enter email + password. Provider notes (app-password instructions) shown inline. IMAP/SMTP/Signature fieldsets collapsed behind an "Advanced settings" toggle in preset mode.
