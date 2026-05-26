## Why

The README and project docs lack up-to-date visuals of the SvelteKit SPA. Hand-captured screenshots drift out of sync with the UI, vary in viewport/theme, and get stale silently. We already have a deterministic Playwright harness (real `mailbrus-server` + freshly indexed maildir per test) that can stage and capture canonical views reproducibly — we just need a dedicated scenario set that emits documentation-quality PNGs alongside the existing functional specs.

## What Changes

- Add a new Playwright scenario file (e.g. `e2e/specs/screenshots.spec.ts`) that drives the existing SPA into five canonical views and writes one PNG per view to `docs/screenshots/`.
- The five staged views:
  1. **`message-list.png`** — populated mail list, no overlay.
  2. **`reader.png`** — a representative message opened in the reader.
  3. **`accounts.png`** — account list / picker surface.
  4. **`compose.png`** — compose view with realistic draft content.
  5. **`about-over-list.png`** — About dialog overlaid on the message list (real `About.svelte`, not a mock).
- Fix a deterministic viewport, color scheme, and locale for the scenario so screenshots are byte-stable across runs.
- Add a Deno/npm task (e.g. `deno task screenshots`) that runs only this scenario and writes into `docs/screenshots/` (committed). The scenario is excluded from the default `test:e2e` run so functional CI stays fast and free of binary churn.
- Commit the generated PNGs under `docs/screenshots/` as versioned documentation assets, regenerated on demand via the task.
- Reference the screenshots from `README.md`.

## Capabilities

### New Capabilities
- `e2e-screenshots`: Playwright-driven, deterministic capture of documentation screenshots for canonical UI views. Owns the scenario file, viewport/theme/locale conventions, output path under `docs/screenshots/`, and the regeneration task.

### Modified Capabilities
- `playwright-e2e-suite`: Carve out the screenshot scenario from the default `test:e2e` run (opt-in via a dedicated task) so committed PNG output is never produced by routine CI runs.

## Impact

- **New files**: `e2e/specs/screenshots.spec.ts`, `docs/screenshots/*.png` (5 PNGs), small page-object helper if needed for the About overlay state.
- **Modified files**: `package.json` / `deno.json` (new `screenshots` task), `e2e/playwright.config.ts` (project or `testIgnore` entry to exclude screenshots from default runs), `README.md` (embed the new images), `.gitignore` (ensure `docs/screenshots/` is **not** ignored).
- **No production code changes** to `src/lib/components/*` or any Rust crate — all five views already exist (`About.svelte`, `Compose.svelte`, `MailList.svelte`, `Reader.svelte`, `AccountPicker.svelte`).
- **Fixtures**: reuses the existing per-test maildir clone + `mailbrus-server` harness; may pin a specific fixture manifest for reproducible content in the shots.

## Non-goals

- No visual-regression / pixel-diff gating in CI — these PNGs are documentation assets, not baselines.
- No new UI components, redesigns, or copy changes to the five views.
- No marketing/landing-page polish (framing, device mockups, annotations) — those can layer on top of the raw captures later.
- No multi-theme or multi-locale capture matrix in this change; one canonical theme + locale only.
- No automated README regeneration; updating README image references stays manual.
