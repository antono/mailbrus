# AGENTS.md

Guidance for AI agents and contributors working in this repo.

Mailbrus is a Tauri desktop email client: a SvelteKit SPA frontend served by a
Rust `mailbrus-server` backed by a real notmuch index. The Cargo workspace holds
`mailbrus-core`, `mailbrus-cli`, `mailbrus-server`, and `src-tauri` (the desktop
shell). Frontend tasks run through Deno (`deno task …`); the same scripts are
mirrored in `package.json` for `npm run …`.

## Common commands

| Command | What it does |
| --- | --- |
| `deno task dev` | Vite dev server for the SPA. |
| `deno task build` | Build the SPA into `build/`. |
| `cargo tauri dev` | Run the desktop app (builds SPA + `mailbrus-server`, regenerates the sidecar, opens the window). |
| `cargo tauri build` | Bundle the desktop app (release server sidecar included). |
| `deno task e2e:generate` | Regenerate the E2E maildir corpus from `e2e/fixtures/manifest.ts`. |

> The Tauri build expects a sidecar at `src-tauri/binaries/mailbrus-server-<host-triple>`.
> `beforeDevCommand`/`beforeBuildCommand` regenerate it automatically (debug for
> dev, release for bundle); the triple is detected via `rustc -vV`.

## E2E tests

The suite drives the real SPA against a real `mailbrus-server` and notmuch index —
one freshly cloned, indexed mailbox and its own server **per test**. Architecture,
lifecycle, and fixtures are documented in [`e2e/README.md`](e2e/README.md) and
[`docs/e2e-testing.md`](docs/e2e-testing.md).

Run inside the Nix devShell (`nix develop`) so notmuch and the Playwright browsers
are available, then `deno install` to hydrate `node_modules`.

| Task | Purpose |
| --- | --- |
| `deno task test:e2e` | Headless run (parallel workers). The default for CI and quick checks. |
| `deno task e2e:headless` | Same as `test:e2e` — explicit headless run. |
| `deno task e2e:ui` | Interactive **Playwright UI mode** (Chromium): pick/watch/re-run tests with time-travel. |
| `deno task e2e:debug` | Open the **trace viewer** on the newest retained trace, for debugging a failed run. |

(Each task also exists as `npm run <task>`.)

### Debugging a failure with traces

Traces are kept only on failure (`trace: 'retain-on-failure'` in
`e2e/playwright.config.ts`) under `e2e/test-results/<test>/trace.zip`
(gitignored). To debug:

1. Run the suite (e.g. `deno task test:e2e`); a failing test leaves a `trace.zip`.
2. `deno task e2e:debug` — opens the trace viewer on the most recent
   `trace.zip`. If none exist yet, it opens the empty viewer where you can drop a
   trace file manually.

The trace viewer is a local PWA; it never uploads your trace.
