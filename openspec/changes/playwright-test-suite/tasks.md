## 1. Scaffolding

- [x] 1.1 Create the `e2e/` directory tree per design D7 (`fixtures/`, `harness/`, `pages/`, `specs/`) with `e2e/tsconfig.json` and a placeholder `e2e/README.md`
- [x] 1.2 Add `@playwright/test` via Deno npm compat; create `e2e/playwright.config.ts` (testDir `specs/`, global setup, `webServer` disabled — the harness owns servers, sane `workers`/timeouts)
- [x] 1.3 Add a `test:e2e` task (and any `build`-deps task) to `deno.json`; wire `package.json` if needed

## 2. Pristine fixture corpus

- [x] 2.1 Create two account maildirs (e.g. `alice@example.com`, `bob@example.com`), each with `Inbox/`, `Sent/`, `Archive/`, `Spam/`, `Trash/`, every folder having `cur/`, `new/`, `tmp/`
- [x] 2.2 Author read/unread messages via maildir flags (`new/` and `cur/` with/without `S`)
- [x] 2.3 Author flagged (`F`) and replied (`R`) messages
- [x] 2.4 Author trashed messages placed in each account's `Trash/` folder (delete = move-to-Trash model)
- [x] 2.5 Author messages with no attachments, with one attachment, and with multiple attachments of differing MIME types
- [x] 2.6 Author mailing-list/subscription messages carrying `List-Id` / `List-Unsubscribe` headers
- [x] 2.7 Author signed and unsigned message variants (broken-signature variant deferred — see 8.x)
- [x] 2.8 Ensure no `.notmuch/`/Xapian artifacts are committed; add `.gitignore` guard for generated indexes under temp clones

## 3. Fixture manifest

- [x] 3.1 Define `e2e/fixtures/manifest.ts` typed model (accounts → folders → messages with state/attachments/list/signature attributes)
- [x] 3.2 Populate the manifest to match the on-disk corpus exactly
- [x] 3.3 Add a manifest↔disk consistency check (script or first spec) asserting every manifest entry exists on disk and vice versa

## 4. Harness — clone & index

- [x] 4.1 `harness/clone.ts`: copy pristine corpus into `Deno.makeTempDir({ prefix: 'mailbrus-e2e-' })`; recursive cleanup helper
- [x] 4.2 `harness/notmuch.ts`: write a scoped notmuch config (`database.path` = clone root, minimal `[user]`/`[new]`), run `notmuch new` with `NOTMUCH_CONFIG` set; fail clearly if `notmuch` is missing
- [x] 4.3 Assert the resolved `database.path` is inside the clone before proceeding (hermeticity guard)

## 5. Harness — server & fixtures

- [x] 5.1 `harness/server.ts`: reserve a free port, spawn `target/release/mailbrus-server --bind 127.0.0.1:<port> --frontend-dist build` with scoped `NOTMUCH_CONFIG`, health-poll `GET /api/maildirs` until ready, and a stop() that SIGTERMs and awaits exit
- [x] 5.2 `harness/fixtures.ts`: `test.extend({ app })` that per-test clones → indexes → spawns server → yields base URL → tears down (server stop + clone delete) in `finally` so cleanup runs on pass and fail
- [x] 5.3 Global setup: ensure `build/` (run frontend build) and `target/release/mailbrus-server` (cargo build) exist; fail fast if notmuch or Playwright browsers are unavailable

## 6. Page objects

- [x] 6.1 Account/maildir list page object
- [x] 6.2 Folder navigation + message-list page object (incl. pagination controls and indicators)
- [x] 6.3 Message view page object (headers, body, attachments, signature indicator)

## 7. Specs

- [x] 7.1 `maildirs.spec.ts` — accounts from manifest are listed
- [x] 7.2 `folders.spec.ts` — selecting an account shows its folders; selecting a folder lists its messages
- [x] 7.3 `pagination.spec.ts` — page navigation shows expected messages; page/per-page/count indicators match manifest
- [x] 7.4 `message-read.spec.ts` — message renders headers/body; unread→read transition reflected in UI
- [x] 7.5 `attachments.spec.ts` — attachments shown for attachment-bearing messages; none shown otherwise — _UI "attachments shown" is `test.fixme` (SPA never wires attachments into the reader); backend exposure is asserted, and "no attachments shown" is green_
- [x] 7.6 `signatures.spec.ts` — signed vs unsigned states rendered distinctly (broken-signature case skipped/`test.fixme` until 8.x)
- [x] 7.7 Ensure all specs derive expectations from the manifest, contain no inline setup, and use page objects only

## 8. Deferred — broken signatures (optional)

- [x] 8.1 Decide broken-signature representation in raw `.eml` and add the variant(s) to the corpus + manifest (`alice-inbox-06`, tampered inline PGP)
- [x] 8.2 Enable the broken-signature scenario in `signatures.spec.ts` (assert a distinct invalid state) — _present as `test.fixme`: the SPA only distinguishes signed vs unsigned (a `-- ` line); a distinct broken state needs a production code change (frozen for this change)_

## 9. CI & docs

- [x] 9.1 Add a CI job that installs notmuch + Playwright browsers, builds the SPA and server, and runs `deno task test:e2e` with a capped worker count (`.github/workflows/e2e.yml`, via the Nix devShell)
- [x] 9.2 Flesh out `e2e/README.md`: how to run locally, how to add a fixture message + manifest entry, how to add a spec
- [x] 9.3 Verify a full run leaves the pristine corpus byte-for-byte unchanged and no `mailbrus-e2e-*` temp dirs remain
