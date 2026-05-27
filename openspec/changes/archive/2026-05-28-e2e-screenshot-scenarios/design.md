## Context

The repo already has a deterministic Playwright harness: each test in `e2e/specs/*.spec.ts` clones a fresh maildir, spins up its own `mailbrus-server`, and drives the SvelteKit SPA. Page objects (`AccountsPage`, `MailboxPage`, `MessagePage`) and a typed fixture manifest already cover the five canonical views needed for documentation screenshots:

- `MailList.svelte` (message list)
- `Reader.svelte` (reader)
- `AccountPicker.svelte` (account list)
- `Compose.svelte` (compose)
- `About.svelte` (About dialog, overlay-capable)

Today, README and design docs have no committed screenshots. Hand-captured shots drift, vary in chrome (window borders, mouse cursors, color scheme), and silently age. We want a one-command path to regenerate canonical PNGs from the live SPA, committed under `docs/screenshots/`, with zero impact on functional CI runtime.

## Goals / Non-Goals

**Goals:**
- Single command (e.g. `deno task screenshots`) produces all five PNGs deterministically.
- Output committed under `docs/screenshots/` as documentation assets.
- Reuses existing harness (`fixtures.ts`, `server.ts`, page objects) — no parallel infrastructure.
- Output is byte-stable enough that re-runs on the same code produce identical-or-near-identical PNGs (small diffs only from font hinting are acceptable since we are not pixel-gating).
- The default `deno task test:e2e` run is unaffected: no new tests added to its execution set, no PNG churn from CI.

**Non-Goals:**
- Visual regression / pixel-diff gating in CI.
- A multi-theme / multi-locale matrix.
- Marketing polish (annotations, device frames, drop shadows).
- New UI components or copy changes.
- Automating README image references — that stays manual.

## Decisions

### D1. Implement as a Playwright spec, not a custom script

The screenshot capture lives in `e2e/specs/screenshots.spec.ts`, structured as ordinary Playwright tests where the assertion *is* `await page.screenshot(...)`.

**Why:** The existing harness fixture already gives us a cloned maildir, a live server, and a configured page. Reimplementing that in a standalone Node script would duplicate ~200 lines of setup and drift from how real tests stage the app. Playwright also normalizes viewport, color scheme, locale, and animations across machines, which is exactly what we need for deterministic output.

**Alternative considered:** A standalone `scripts/screenshots.ts` driving Playwright directly. Rejected — duplicates harness setup, splits maintenance.

### D2. Exclude screenshot spec from the default `test:e2e` project, expose via a dedicated Playwright project

Add a second Playwright project entry in `e2e/playwright.config.ts` named `screenshots`, scoped to `specs/screenshots.spec.ts`. The default project (`testIgnore: ['**/screenshots.spec.ts']` or equivalent) skips it. A new task `deno task screenshots` invokes `playwright test --project=screenshots`.

**Why:** A dedicated project lets us pin distinct viewport, color-scheme, and locale settings without polluting functional tests. Excluding by project (rather than file glob alone) means the screenshot run can have its own `use:` block (e.g. fixed `viewport: { width: 1280, height: 800 }`, `colorScheme: 'light'`, `locale: 'en-US'`, `deviceScaleFactor: 2` for retina-quality PNGs).

**Alternative considered:** A `@screenshot` test tag + `--grep`. Rejected — less ergonomic and doesn't isolate viewport/device settings.

### D3. Output to `docs/screenshots/` directly, no copy step

The scenario writes PNGs straight to `docs/screenshots/<name>.png` using an absolute path resolved from the repo root (Playwright resolves `path` relative to `cwd`, which is the repo root when invoked via Deno tasks).

**Why:** Simplest pipeline. No staging dir, no copy step, no post-processing. Re-running the task overwrites in place; `git diff` and `git status` immediately show what changed.

**Alternative considered:** Write under `e2e/test-results/screenshots/` and copy to `docs/screenshots/` via a follow-up script step. Rejected as unnecessary indirection.

### D4. Stage content deterministically from the existing fixture manifest

Pick stable message IDs from `e2e/fixtures/manifest.ts` for the reader and message-list shots so the captured subject lines, senders, and dates are predictable. For the compose shot, pre-fill the form with hard-coded literal content from inside the scenario (To, Subject, Body) so it doesn't rely on a draft fixture.

**Why:** Manifest-driven content is the established pattern in the existing suite (see `playwright-e2e-suite` spec: "Assertions reference the manifest"). For compose, no manifest entries describe drafts today, and inventing one purely for screenshots is overkill — literal inline content is fine since the screenshot scenario is the only consumer.

### D5. Stabilize against time-sensitive UI

Before each screenshot, the scenario will:
- Wait for network idle.
- Hide caret blink (`page.addStyleTag({ content: '* { caret-color: transparent !important; }' })`).
- Disable animations (`* { transition: none !important; animation: none !important; }`).
- Freeze "now" if any relative timestamps are visible — either via `page.clock.install({ time: <fixed date> })` (Playwright ≥1.45) or by ensuring the manifest's stable absolute dates are what's rendered.

**Why:** Reduces noise from blinking carets, fade-in animations, and "5 minutes ago"-style relative times.

### D6. About-over-list shot uses the real `About.svelte` opened from the message-list view

The scenario navigates to a populated mailbox, then triggers the real About dialog (via its actual entry point — keyboard shortcut, command palette, or menu — whichever exists in `About.svelte`'s mount logic) and captures with the modal visible over the list.

**Why:** Per user direction, no test-only overlay. The screenshot reflects what a user actually sees. If the About entry point is missing or hidden, that's a separate fix and a blocker for this shot, not something the screenshot scenario should paper over.

### D7. PNG naming and set

Five files, fixed names, written to `docs/screenshots/`:

| File | View |
| --- | --- |
| `message-list.png` | Populated mailbox, no overlay |
| `reader.png` | A representative message open |
| `accounts.png` | Account list / picker |
| `compose.png` | Compose with realistic inline draft |
| `about-over-list.png` | About modal over message list |

## Risks / Trade-offs

- **[Risk] Font rendering varies between machines (CI vs. local vs. contributor laptops) → PNG diffs on every regen.** Mitigation: accept it — these are docs, not regression baselines. Contributors regenerate only on intentional UI change. CI never regenerates.
- **[Risk] Adding a second Playwright project complicates `playwright.config.ts`.** Mitigation: keep the `screenshots` project tightly scoped (one file glob, one `use:` block) and document its purpose inline.
- **[Risk] About modal entry point may be subtle (keyboard-only, command palette).** Mitigation: read `About.svelte` and any wiring in `+page.svelte` first; if the entry point requires a chord or palette step, encode it as a small helper in the scenario rather than building a page object (single consumer).
- **[Risk] `docs/screenshots/` PNGs bloat the repo over time.** Mitigation: only five files, regenerated in place (no history of additions); revisit if the set grows past ~10–15.
- **[Trade-off] No pixel diffing means a broken UI can silently produce ugly screenshots.** Acceptable — functional specs catch breakage; screenshots are visually reviewed by the contributor at regen time.

## Migration Plan

1. Land the change with the screenshot project disabled-by-default (i.e. not in `test:e2e`).
2. Run `deno task screenshots` once locally, commit the resulting five PNGs alongside the new spec/config.
3. Embed images in README and any relevant `docs/*.md` in the same PR or a follow-up.
4. Rollback is trivial: revert the PR or delete the screenshot spec + config project + PNGs — no production code touched.

## Open Questions

- Should `deno task screenshots` run `playwright install chromium` as a prerequisite, or rely on `nix develop` having the browsers? (Lean toward the latter to match other e2e tasks.)
- Light theme only for now, or also capture a dark-theme variant? (Lean toward light-only in this change; dark can be a follow-up if the app gains a theme toggle.)
- About modal entry point — needs a quick read of `About.svelte` during task execution to confirm how to open it.
