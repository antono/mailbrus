## Why

Mailbrus has no end-to-end tests. The SvelteKit UI, the `mailbrus-server` HTTP API, and the notmuch-backed `mailbrus-core` reader are only covered in isolation, so regressions in real user flows (listing maildirs, paginating, reading messages, rendering attachments and signatures) go undetected. We need a deterministic E2E suite driven against a realistic mailbox, with each test fully isolated so tests cannot pollute one another.

## What Changes

- Add a **pristine maildir fixture** committed to the repo: multiple accounts, multiple folders each (Inbox, Sent, Archive, Spam, Trash), and messages spanning every state the UI must handle — read/unread, flagged, replied, with/without attachments, mailing-list/subscription mail with valid signatures, missing signatures, and broken signatures.
- Add an **E2E test harness** that, per test: clones the pristine fixture to a temp dir, writes a scoped notmuch config pointing at the clone, runs `notmuch new` to index it, boots `mailbrus-server` against that clone (via `NOTMUCH_CONFIG`), runs the Playwright test, then tears down the server and deletes the clone.
- Add a **Playwright E2E suite** with strictly defined file organization (fixtures, harness, specs, page objects, fixture-data manifest) and tests covering the core UI flows.
- Wire the suite into a runnable task (`deno task test:e2e` / equivalent) for local and CI use.

No production code changes are required: `MaildirReader::open()` already resolves the database through notmuch's standard config lookup, so per-test isolation is achieved purely via `NOTMUCH_CONFIG`.

## Capabilities

### New Capabilities

- `test-maildir-fixtures`: the committed pristine maildir corpus and its documented manifest (accounts, folders, message states, attachment/signature variants) that tests assert against.
- `e2e-test-harness`: per-test lifecycle — clone fixture, generate scoped notmuch config, `notmuch new` index, spawn/wait-for `mailbrus-server`, expose base URL, guaranteed teardown and clone deletion.
- `playwright-e2e-suite`: the Playwright project configuration, mandated directory/file layout, page objects, and the E2E test specs for maildir listing, folder navigation, pagination, message reading, attachments, and signature states.

### Modified Capabilities

<!-- None. Server resolves notmuch DB via NOTMUCH_CONFIG; no spec-level behavior changes. -->

## Impact

- **New files/dirs**: test fixture tree, Playwright config, harness, specs, fixture manifest.
- **Tooling/deps**: Playwright (browsers), a notmuch binary available at test time; new `test:e2e` task.
- **CI**: a job that installs Playwright + notmuch and runs the suite.
- **Code**: none required in `mailbrus-server`/`mailbrus-core`; an optional `--notmuch-config` server flag may be considered in design as an alternative to the env var.
