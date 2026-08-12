## ADDED Requirements

### Requirement: Desktop generates a per-launch bearer token

In a bundled (non-dev) build, the desktop shell SHALL generate a fresh,
cryptographically-random bearer token each time it launches. The token SHALL carry at
least 256 bits of entropy and SHALL exist only for the lifetime of that launch — it is
never persisted to disk by the shell.

#### Scenario: Fresh token per launch
- **WHEN** the bundled desktop app starts
- **THEN** a new random token is generated using a cryptographic RNG
- **AND** a subsequent launch generates a different token

### Requirement: Desktop launches the sidecar with the generated token

In a bundled build, the desktop shell SHALL spawn the `mailbrus-server` sidecar with
`--auth <token>` using the token from this launch, so the local API requires that token on
`/api/*`.

#### Scenario: Sidecar enforces the launch token
- **WHEN** the bundled desktop app spawns the sidecar
- **THEN** the sidecar is passed `--auth <token>`
- **AND** an `/api/*` request without `Authorization: Bearer <token>` is rejected `401`
- **AND** an `/api/*` request with the matching bearer token succeeds

### Requirement: Desktop injects the token into the webview before app scripts

In a bundled build, the desktop shell SHALL construct the main webview with an
initialization script that sets `window.__MAILBRUS_AUTH_TOKEN__` to the launch token. The
script SHALL run before any SPA script on every navigation and reload, so the frontend
reads a token that always matches the running sidecar. The injected value SHALL be encoded
as a valid JavaScript string literal.

#### Scenario: SPA authenticates without user action
- **WHEN** the bundled desktop app opens its window
- **THEN** `window.__MAILBRUS_AUTH_TOKEN__` equals the launch token before SPA code runs
- **AND** the SPA's `/api/*` requests carry the matching bearer token
- **AND** no auth screen is shown

#### Scenario: Reload re-injects the current token
- **WHEN** the webview is reloaded
- **THEN** `window.__MAILBRUS_AUTH_TOKEN__` is set again to the current launch token

### Requirement: Dev mode is exempt from token generation and injection

The desktop shell SHALL keep dev mode token-less. In a dev build (`cargo tauri dev`, where
the sidecar is started by `beforeDevCommand`), the shell SHALL NOT generate a token, SHALL
NOT pass `--auth`, and SHALL NOT inject `window.__MAILBRUS_AUTH_TOKEN__`.

#### Scenario: Dev run stays token-less
- **WHEN** the app is run in dev mode
- **THEN** no `--auth` argument is added and no token is injected
- **AND** `/api/*` requests succeed without an `Authorization` header
