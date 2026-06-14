# Mail Sync

Mailbrus syncs mail from IMAP servers into a local [notmuch](https://notmuchmail.org/) index stored as Maildir. Sync is triggered on demand — either via the server API or the desktop UI — and streams progress back over SSE.

## Config file

Create `~/.config/mailbrus/config.toml`. Each `[accounts.<id>]` section defines one mail account. The `<id>` becomes the account identifier used in API calls and notmuch tags.

```toml
[accounts.work]
protocol          = "imap"
email             = "alice@work.com"
display_name      = "Alice (Work)"     # optional; shown in UI
imap_host         = "imap.work.com"
imap_port         = 993
imap_tls          = true
credential_backend = "keyring"
credential_ref    = "work-imap"        # key name in the OS keychain
```

**Required fields:** `protocol`, `email`, `imap_host`, `imap_port`, `imap_tls`, `credential_backend`, `credential_ref`.

**Optional fields:**

| Field | Default | Description |
|---|---|---|
| `display_name` | — | Display name shown in the UI |
| `maildir_root` | `~/.local/share/mailbrus/mail/<id>/` | Override where mail is stored on disk |
| `pass_gpg_backend` | — | GPG backend for `pass` credential store: `gnupg-bin`, `gpgme`, or `rpgpie` |

### Gmail example

Gmail requires an [App Password](https://support.google.com/accounts/answer/185833) (not your Google account password). Enable 2-Step Verification first, then generate an App Password under Security → 2-Step Verification → App passwords.

```toml
[accounts.gmail]
protocol          = "imap"
email             = "you@gmail.com"
display_name      = "Gmail"
imap_host         = "imap.gmail.com"
imap_port         = 993
imap_tls          = true
credential_backend = "keyring"
credential_ref    = "gmail-app-password"
```

Store the App Password in your OS keychain:

```bash
# macOS / GNOME Keyring / KDE Wallet — uses the system secret service
secret-tool store --label="mailbrus gmail" service mailbrus account gmail-app-password

# Or with the keyring CLI (cross-platform):
keyring set mailbrus gmail-app-password
```

### Credential backends

| Backend | Value | How it works |
|---|---|---|
| OS keychain | `"keyring"` | Reads from macOS Keychain, Windows Credential Manager, or Linux Secret Service (D-Bus). `credential_ref` is the key name. |
| `pass` | `"pass"` | Runs `pass show <credential_ref>` and reads the first line. Set `pass_gpg_backend` if you need a specific GPG implementation. |
| Plain text | `"plain"` | `credential_ref` **is** the password. Development and testing only — never use for real accounts. |

### Multiple accounts

```toml
[accounts.gmail]
protocol          = "imap"
email             = "you@gmail.com"
imap_host         = "imap.gmail.com"
imap_port         = 993
imap_tls          = true
credential_backend = "keyring"
credential_ref    = "gmail-app-password"

[accounts.work]
protocol          = "imap"
email             = "you@corp.com"
imap_host         = "mail.corp.com"
imap_port         = 993
imap_tls          = true
credential_backend = "pass"
credential_ref    = "mail/corp"
pass_gpg_backend  = "gpgme"
```

## Storage layout

All paths follow [XDG Base Directory](https://specifications.freedesktop.org/basedir-spec/latest/) conventions.

| Path | Contents |
|---|---|
| `~/.config/mailbrus/config.toml` | Account configuration |
| `~/.local/share/mailbrus/mail/<account-id>/` | Maildir tree (one per account) |
| `~/.local/share/mailbrus/sync.db` | SQLite sync state (UID validity, last modseq, message UID index) |

## Starting the server

Pass `--config` and `--notmuch-db` if the defaults don't match your setup:

```bash
mailbrus-server \
  --config ~/.config/mailbrus/config.toml \
  --notmuch-db ~/.mail
```

The server reads the config file at startup and initialises the sync engine for each configured account. If the config file is absent or has no accounts, sync is disabled but the server still runs.

**Key flags:**

| Flag | Default | Description |
|---|---|---|
| `--bind` | `127.0.0.1:1371` | Address to listen on |
| `--config` | `$XDG_CONFIG_HOME/mailbrus/config.toml` | Path to account config |
| `--notmuch-db` | resolved at runtime | Path to notmuch database root |
| `--log-level` | `info` | `debug` / `info` / `warn` |

## Triggering a sync

### Via the API

```bash
# Sync all configured accounts
curl -X POST http://127.0.0.1:1371/api/sync

# Sync one account by ID
curl -X POST http://127.0.0.1:1371/api/sync/gmail
```

Both return `202 Accepted` immediately. The sync runs in the background.

### Monitor progress (SSE)

```bash
curl -N http://127.0.0.1:1371/api/sync/stream
```

Each event is a JSON object:

```
data: {"account_id":"gmail","mailbox":"INBOX","status":"running","fetched":42,"deleted":0}
data: {"account_id":"gmail","mailbox":"INBOX","status":"done","fetched":42,"deleted":0}
data: {"account_id":"gmail","mailbox":"INBOX","status":"error","fetched":0,"deleted":0,"error":"..."}
```

`status` is one of `running`, `done`, or `error`.

**HTTP status codes for `POST /api/sync/<account>`:**

| Code | Meaning |
|---|---|
| `202` | Sync accepted and started |
| `404` | Account ID not found in config |
| `409` | Sync already running for that account |
| `503` | No sync engine configured (no accounts in config) |

## Reading synced mail with the CLI

After a sync, use `mailbrus` to browse the notmuch index:

```bash
# List all messages (newest first, 25 per page)
mailbrus message list

# Page through results
mailbrus message list --page 2 --per-page 50

# Search by notmuch query
mailbrus message search "tag:inbox"
mailbrus message search "from:alice@example.com"
mailbrus message search "subject:invoice date:last30days"

# Read a specific message (get the ID from list/search --output json)
mailbrus message read <message-id>

# JSON output (pipe-friendly)
mailbrus message list --output json
mailbrus message search "tag:unread" --output json
```

Synced messages are automatically tagged `account:<id>` and `mailbox:<folder>` in notmuch, so you can filter by account:

```bash
mailbrus message search "tag:account:gmail and tag:mailbox:INBOX"
```

## How sync works

1. **Connect** — opens a TLS IMAP connection and authenticates using the configured credential backend.
2. **Delta sync** — if the server advertises CONDSTORE, mailbrus fetches only messages changed since the last `HIGHESTMODSEQ`. Otherwise it does a full UID scan.
3. **UIDVALIDITY** — if `UIDVALIDITY` changes (server rebuilt its index), the entire mailbox is re-synced from scratch.
4. **Maildir write** — new messages are written to `<maildir_root>/new/` with a filename encoding the UID validity, UID, and IMAP flags.
5. **Notmuch index** — messages are indexed with `account:<id>` and `mailbox:<name>` tags. The notmuch database must exist and be initialised beforehand (`notmuch new` or the desktop app's first-run flow).
6. **State persistence** — `sync.db` records the last `HIGHESTMODSEQ` and UID→file mapping per account/mailbox so subsequent syncs are incremental.
