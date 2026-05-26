# OpenSpec mapping for the `// openspec/...` reference comment

Every spec in `e2e/specs/` carries a one-line OpenSpec reference above each
test (see SKILL.md "Hard rules" #1). This file lists the capability slugs the
existing suite cites and what each one covers, so you can pick the right path
without guessing.

If a behaviour is still being defined and lives under
`openspec/changes/<change-name>/`, cite the change-scoped path:
`// openspec/changes/<change-name>/specs/<capability>/spec.md: <one-liner>`.
Once the change is archived into `openspec/specs/<capability>/spec.md`, the
spec file's references should be updated in the same commit that archives the
change (so audits stay clean).

## Quick lookup — by area of UI / backend the test touches

| Area you're testing | Cite |
| --- | --- |
| Account picker, folder picker, settings panel mechanics, command palette, dark mode, accent, fonts, density, key hints, About dialog, mailto links, sticky header, plain-text default, unread → read in the list | `openspec/specs/sveltekit-ui/spec.md` |
| Reader rendering: subject/from/to/date/body, signature state, attachment display, rendering modes (text/simple/html), iframe sandbox, XSS, remote-content blocking, metadata layout | `openspec/specs/message-read/spec.md` |
| Pagination: page navigation, `X / Y` indicator, pg-counter pulse animation | `openspec/specs/message-pagination-ui/spec.md` |
| URL routing: deep-link, reload-restores-view, Back/Forward, invalid-link fallback, SPA shell from server | `openspec/specs/sveltekit-frontend-scaffold/spec.md` (URL update) and `openspec/specs/ui-path-routing/spec.md` (route grammar) |
| Vimium-style `f`-key link hints (list + reader) | `openspec/specs/vimium-link-hints/spec.md` |
| Global keyboard shortcuts, palette key (`Ctrl+K`), settings key (`Ctrl+,`), `Esc` semantics | `openspec/specs/ui-hotkeys/spec.md` |
| Search submission / query routing | `openspec/specs/message-search/spec.md` |
| Backend HTTP API (any `/api/...` assertion, JSON shape, status codes) | `openspec/specs/mailbrus-server-crate/spec.md` |
| Notmuch indexing and tag-derived state (`unread`, `flagged`, `replied`) | `openspec/specs/notmuch-index/spec.md` |
| Maildir-level structure, listing, ordering | `openspec/specs/maildir-reader/spec.md` |
| Maildir mutation commands (flag / move / etc.) | `openspec/specs/maildir-commands/spec.md` |
| Pristine corpus consistency (manifest ↔ on-disk `.eml`, no committed index) | `openspec/specs/test-maildir-fixtures/spec.md` |
| Harness lifecycle (clone → index → spawn server → teardown, hermeticity guard) | `openspec/specs/e2e-test-harness/spec.md` |
| Suite shape itself (page objects, no inline setup, manifest-derived assertions) | `openspec/specs/playwright-e2e-suite/spec.md` |
| Frontend data layer (fetch, cache, IDB shape, outbox) | `openspec/specs/frontend-data-layer/spec.md` |
| PWA: service worker, manifest, badging, background sync, push | `openspec/specs/pwa-service-worker/spec.md`, `pwa-manifest`, `pwa-badging`, `pwa-background-sync`, `pwa-push-notifications` |
| Outgoing mail / SMTP | `openspec/specs/smtp-sender/spec.md` |
| Server-side logging output | `openspec/specs/server-logging/spec.md` |
| Cargo workspace / build / Nix / Tauri shell — rarely covered by an E2E test, but cite if you do | `cargo-workspace`, `nix-build-infrastructure`, `mailbrus-desktop-crate` |

## Change-scoped citations seen in this suite

When an in-flight change is the source of truth for the behaviour, cite under
`openspec/changes/<change>/specs/...`. The repo has historical examples; the
pattern is:

```
// openspec/changes/ui-attachements/specs/attachment-actions/spec.md: download endpoint
// openspec/changes/ui-attachements/specs/sveltekit-ui/spec.md: attachmentAction persists
```

A change directory typically contains one or more capability deltas under
`specs/<capability>/spec.md`. Pick the capability that owns the requirement —
in the example above, the API-shape requirement lives under
`attachment-actions`, and the SPA-side click-action behaviour lives under
`sveltekit-ui` even though both belong to the same change.

## Picking the one-liner

The suffix after `:` is a hint for whoever reads the file later — it should
identify the *specific requirement* inside the spec, not restate the test
name. Existing examples:

- `pagination navigation + X/Y format` — names the requirement family
- `pg-counter pulse animation` — points at the specific scenario
- `iframe sandbox security` — names the security property under test
- `unknown index → 404` — names the error case

Keep it under ~60 characters; the test name already carries the human-readable
scenario.

## When the right spec doesn't exist yet

If you're writing a test for behaviour that has no OpenSpec entry:

1. Stop and either (a) add the requirement to the appropriate
   `openspec/specs/<capability>/spec.md`, or (b) open an `openspec/changes/`
   proposal that includes the new requirement under
   `specs/<capability>/spec.md`.
2. Cite the new path in the test comment.

Writing an untethered test — one that asserts behaviour no spec describes —
defeats the contract the suite was designed to enforce. The project's
OpenSpec rules (see `openspec/config.yaml`) explicitly require E2E coverage
for each design and an "e2e test validation and fixes" cycle at the end of
every task list, so this loop is the norm here.
