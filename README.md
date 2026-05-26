# Mailbrus

Fast keyboard-first mail client with offline-capable PWA support.

> **⚠ WIP** — This is early-stage software. Mail sync and sending are **not yet implemented**.

## Screenshots

![About over list](docs/screenshots/about-over-list.png)

<div style="display: flex; flex-wrap: wrap; gap: 8px;">
  <a href="docs/screenshots/message-list.png"><img src="docs/screenshots/message-list.png" width="180" alt="Message list"></a>
  <a href="docs/screenshots/reader.png"><img src="docs/screenshots/reader.png" width="180" alt="Reader"></a>
  <a href="docs/screenshots/accounts.png"><img src="docs/screenshots/accounts.png" width="180" alt="Accounts"></a>
  <a href="docs/screenshots/compose.png"><img src="docs/screenshots/compose.png" width="180" alt="Compose"></a>
</div>

## Installation

Requires [Nix](https://nixos.org/download) with flakes enabled.

```sh
# Run directly (ephemeral)
nix run github:antono/mailbrus

# Install to your profile
nix profile install github:antono/mailbrus
mailbrus --help
```

See [docs/development.md](docs/development.md) for server usage, CLI flags, and debug logging.
