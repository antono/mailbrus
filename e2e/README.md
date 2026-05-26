# Mailbrus E2E suite

End-to-end tests that drive the real SvelteKit SPA against a real
`mailbrus-server` backed by a real notmuch index — one **freshly cloned,
freshly indexed mailbox and its own server per test**, with guaranteed
teardown. No production code is exercised through mocks.

## Layout

```
e2e/
  playwright.config.ts     # projects, workers; webServer disabled (harness owns servers)
  tsconfig.json
  fixtures/
    maildir/               # PRISTINE, committed, READ-ONLY corpus (raw .eml, no index)
    manifest.ts            # typed SINGLE SOURCE OF TRUTH: accounts, folders, messages, states
    generate.ts            # materializes maildir/ from manifest.ts
  harness/
    paths.ts               # absolute repo/corpus/build/binary locations
    clone.ts               # copy corpus -> /tmp/mailbrus-e2e-*; recursive cleanup
    notmuch.ts             # scoped notmuch config + `notmuch new` + hermeticity guard
    server.ts              # free port -> spawn server -> health-poll -> stop()
    fixtures.ts            # test.extend({ app }) wiring clone+index+server+teardown
    global-setup.ts        # ensure notmuch / build/ / server binary once per run
  pages/                   # page objects: AccountsPage, MailboxPage, MessagePage
  specs/                   # the tests; assert against the manifest only
```

The maildir tree and `manifest.ts` are the **contract**: specs assert against
the manifest, never against hard-coded literals. Per-test isolation is achieved
purely via `NOTMUCH_CONFIG` (the server resolves its DB through it), so no
production code changes are required.

## Running

Use the Nix devShell so notmuch + the Playwright browsers are on hand:

```sh
nix develop
deno install            # hydrate node_modules (incl. @playwright/test, pinned to nixpkgs' driver)
deno task test:e2e      # == npx playwright test --config=e2e/playwright.config.ts
```

`global-setup.ts` builds `build/` (SPA) and `target/release/mailbrus-server`
on demand if they are missing, and fails fast with a clear message if `notmuch`
is unavailable. Browsers come from `PLAYWRIGHT_BROWSERS_PATH`
(set by the devShell to nixpkgs' `playwright-driver.browsers`).

Outside Nix you must provide a matching browser yourself
(`npx playwright install chromium`) and keep `@playwright/test` in
`package.json` aligned with whatever driver supplies the browser.

## Adding a fixture message

1. Add a `ManifestMessage` to the right account/folder in `fixtures/manifest.ts`
   (unique `slug` **and** unique `messageId` — notmuch dedups on Message-ID).
   State is encoded in `box` (`new` = unread) and `flags` (`F`/`R`/`S`/…).
2. Regenerate the corpus: `deno task e2e:generate`.
3. `specs/consistency.spec.ts` verifies disk and manifest stay in lockstep.

Never hand-edit the generated `.eml` files; edit the manifest and regenerate.

## Adding a spec

Import `test`/`expect` from `../harness/fixtures.ts` (gives you `app.baseURL`
and a per-test server via `page`), drive the UI through the page objects in
`pages/`, and derive every expected value from `fixtures/manifest.ts`. Specs
must contain no inline setup and no hard-coded DOM selectors.

## Screenshots (on-demand only)

`specs/screenshots.spec.ts` is a dedicated Playwright project that captures
five canonical documentation PNGs into `docs/screenshots/`. It is **not** part
of the default `test:e2e` run and is **never** invoked in CI.

```sh
deno task screenshots   # generates docs/screenshots/*.png
```

The five captures are: `message-list.png`, `reader.png`, `accounts.png`,
`compose.png`, and `about-over-list.png`. Re-run to regenerate after UI
changes; commit the updated PNGs alongside any visual change.

The spec reuses the same harness fixtures as functional tests (one cloned
mailbox + live server per test) and pins viewport, colour scheme, locale, and
device scale via the `screenshots` Playwright project in `playwright.config.ts`.

## Known UI gaps (tests marked `test.fixme`)

These document real product limitations; the corpus + backend already support
them, so each test enables the moment the SPA does:

- **Attachments are never shown in the reader.** The list API omits attachments
  and `+page.svelte` discards `fetchMessage().attachments`. The backend serves
  them correctly (asserted in `attachments.spec.ts`).
- **No distinct broken-signature state.** The SPA only distinguishes signed vs
  unsigned (presence of a `-- ` line); a tampered signature renders as unsigned.
