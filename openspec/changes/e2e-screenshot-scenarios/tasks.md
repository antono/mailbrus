## 1. Wiring: dedicated Playwright project + on-demand task

- [x] 1.1 Add a second Playwright project entry named `screenshots` in `e2e/playwright.config.ts` with `testMatch: ['specs/screenshots.spec.ts']` and a `use:` block pinning `viewport: { width: 1280, height: 800 }`, `colorScheme: 'light'`, `locale: 'en-US'`, and `deviceScaleFactor: 2`.
- [x] 1.2 Exclude `specs/screenshots.spec.ts` from the default project via `testIgnore` so `deno task test:e2e` does not pick it up.
- [x] 1.3 Add `screenshots` task to `deno.json` (and mirror in `package.json` `scripts`) that runs `playwright test --project=screenshots`.
- [x] 1.4 Ensure `docs/screenshots/` is **not** in any `.gitignore`; remove any matching pattern if found, and add a `.gitkeep` only if needed before the first regen.
- [x] 1.5 Audit CI workflows under `.github/workflows/` (if present): confirm none invoke `--project=screenshots`, `deno task screenshots`, or `e2e/specs/screenshots.spec.ts`. Add a brief inline comment near the e2e step noting that screenshots are on-demand only.

## 2. Capture scenario

- [x] 2.1 Create `e2e/specs/screenshots.spec.ts` importing `test` from `e2e/harness/fixtures.ts` (not from `@playwright/test`).
- [x] 2.2 Add a small pre-capture helper inside the spec that: waits for `networkidle`, injects `* { transition: none !important; animation: none !important; caret-color: transparent !important; }`, and resolves before screenshot.
- [x] 2.3 Implement test `captures message-list.png`: navigate to a populated account/folder from `e2e/fixtures/manifest.ts`, dismiss any open overlays, run the pre-capture helper, write `docs/screenshots/message-list.png`.
- [x] 2.4 Implement test `captures reader.png`: open a manifest-referenced message via `MessagePage`/`MailboxPage`, wait for body render, run pre-capture, write `docs/screenshots/reader.png`.
- [x] 2.5 Implement test `captures accounts.png`: stage the accounts/picker view via `AccountsPage`, run pre-capture, write `docs/screenshots/accounts.png`.
- [x] 2.6 Implement test `captures compose.png`: open Compose, fill realistic literal To/Subject/Body inline, run pre-capture, write `docs/screenshots/compose.png`.
- [x] 2.7 Inspect `src/lib/components/About.svelte` and its mount/trigger wiring in `src/routes/[...path]/+page.svelte` and `CommandPalette.svelte`; identify the production entry point (shortcut, palette item, or menu).
- [x] 2.8 Implement test `captures about-over-list.png`: from the populated message-list view, trigger the real About dialog via the entry point identified in 2.7, wait for the modal to be visible, run pre-capture, write `docs/screenshots/about-over-list.png`. No test-only overlay.
- [x] 2.9 All captures use absolute paths resolved from the repo root via `path.resolve(__dirname, '../../docs/screenshots/<name>.png')` (or equivalent) so the working directory does not affect output location.

## 3. Generate, commit, document

- [x] 3.1 Run `deno task screenshots` locally; verify all five PNGs land in `docs/screenshots/` and look correct (visual review).
- [x] 3.2 Re-run `deno task screenshots` a second time and confirm `git diff docs/screenshots/` is empty or near-empty (only font-hinting noise acceptable).
- [x] 3.3 Commit the five PNGs alongside the spec and config changes.
- [x] 3.4 Reference the screenshots from `README.md` (or `docs/` page) with relative image paths.
- [x] 3.5 Add a short section to `e2e/README.md` explaining the screenshots project, the `deno task screenshots` task, and that it is on-demand only (never run in default `test:e2e` or CI).

## 4. Validation cycle

- [ ] 4.1 Run `deno task test:e2e` and verify the screenshot spec was **not** executed (check Playwright report: only functional specs ran, total file count matches prior baseline).
- [ ] 4.2 Run `deno task screenshots` from a clean tree and verify the dedicated project runs only `e2e/specs/screenshots.spec.ts`.
- [ ] 4.3 Run `deno task lint` and `deno task check` (or repo equivalents) to confirm no type or lint regressions in the new spec file.
- [ ] 4.4 If any e2e validation fails, fix and re-run 4.1–4.3 until clean.

## 5. Cleanup

- [ ] 5.1 Resolve any TypeScript / Playwright deprecation warnings emitted by the new spec or config additions.
- [ ] 5.2 Confirm no compilation warnings appear in `cargo check --workspace` (sanity check that the unrelated Rust workspace is unaffected by this frontend-only change).
