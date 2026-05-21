## Why

Mailbrus is positioned as a keyboard-first client ("mutt/aerc fluency"), but no hotkey system exists yet. All navigation currently requires mouse interaction, which contradicts the core product promise.

## What Changes

- **Global list keys**: `j/k/↑/↓` row navigation, `Enter` opens reader, `Esc` goes back, `/` opens search, `c` opens compose, `G` bottom of list
- **Leader key `g`**: 1.2s timeout, on-screen indicator, six follow-ups: `g i/a/s/d/f/A/g`
- **Command palette trigger**: `⌘K` / `Ctrl+K` from the list
- **Palette navigation keys**: `↑/↓`, `Ctrl+N/P`, `j/k` (when search empty), `1–9` row jump (when search empty), `Enter` confirm, `Esc` cancel
- **Reader keys**: `j/k` cycle next/prev message, `Esc` return to list at same cursor
- **Compose keys**: `⌘↵`/`Ctrl+↵` send, `⌘S` save draft, `Esc` discard (with confirmation if any field non-empty), `Tab`/`Shift+Tab` field navigation

## Capabilities

### New Capabilities

- `ui-hotkeys`: Global hotkey dispatcher — key capture, context awareness (which view is active, whether a modal is open), leader-key state machine with timeout and indicator, and routing of keys to the correct handler per view

### Modified Capabilities

_(none — no existing specs change requirements)_

## Impact

- SvelteKit frontend: new global `keydown` event listener, leader-key state store, context enum (list / palette / reader / compose), per-view key handlers
- Breadcrumb/Esc behavior already partially spec'd in REQUIREMENTS §2 — implementation must match that navigation state machine exactly
- No Rust / Tauri / server changes required
