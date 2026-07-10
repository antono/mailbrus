## Why

Mailbrus cannot be used on first launch: when the server starts with no
configured accounts (`[startup] loaded 0 account(s) from config`), the UI shows
an empty mailbox and the only way to add an account is to hand-write
`config.toml` and store a credential out-of-band. New users hit a dead end.

## What Changes

- Add an **account-editing component** rendered in the main window. When the
  frontend detects zero configured accounts it shows this component as an
  onboarding wizard instead of the empty mail view.
- The wizard collects the fields needed for one IMAP account (email, display
  name, IMAP host/port/TLS, SMTP, credential backend + secret, signature/footer)
  and submits them. The email address is the account id.
- **BREAKING — split account config into per-account files.** Replace the single
  `~/.config/mailbrus/config.toml` with `~/.config/mailbrus/accounts/<email>.toml`,
  one file per account, where the account id is the email address (= the filename
  stem). `config.toml` is no longer read.
- Add a server endpoint to **create an account**: write a new
  `accounts/<id>.toml` file and store its secret via the selected credential
  backend (keyring / plain).
- After a successful create, the server reloads accounts so the new account's
  maildir is registered and it is syncable without a restart.
- The same component is reusable later for editing an existing account, but this
  change wires it only into the first-run onboarding path.

## Capabilities

### New Capabilities
- `onboarding-wizard`: empty-state detection plus the in-window account-editing
  form shown when the server reports zero accounts; field validation and submit.

### Modified Capabilities
- `account-config`: **BREAKING** load path — accounts are read from
  `accounts/<email>.toml` files instead of a single `config.toml`; gains a
  **write** path (create a new per-account file + store its credential) and new
  `smtp_*` and `signature` fields, where today config is load-only and IMAP-only.
- `mailbrus-server-crate`: new HTTP route(s) to list account summaries and create
  an account, plus a config reload so a new account becomes active without a
  server restart.

## Impact

- Frontend: new Svelte component + empty-state branch in the main window;
  new client call in the data layer.
- `mailbrus-server`: new route handler(s) in `main.rs`; shared state may need a
  reloadable account list.
- `mailbrus-core`: `load_config` rewritten to scan `accounts/*.toml`; new
  per-account write helper in `config.rs`; credential write in `credentials.rs`.
- Files on disk: `config.toml` is replaced by the `accounts/` directory, written
  by the app; the OS keyring is written too, not just read.
- E2E: a new onboarding flow test (start server with empty `accounts/` → wizard →
  add account → mailbox visible).

## Non-goals

- Editing or removing **existing** accounts through Settings (the component is
  built reusably, but only the first-run create path is wired up here).
- Multi-account add-during-onboarding; the wizard creates a single first account.
- IMAP/SMTP autodiscovery (Thunderbird-style autoconfig) — settings are entered
  manually.
- JMAP accounts and OAuth credential flows.
- Automatic migration of an existing `config.toml` (the format change is
  BREAKING; users re-create accounts via the wizard).
