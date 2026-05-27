# e2e-screenshots

## Purpose

Capture canonical screenshots of the mailbrus SPA for documentation and marketing purposes. Screenshots are generated on-demand via a dedicated Playwright project and committed to the repository as immutable assets.

---

## Requirements

### Requirement: Dedicated screenshot scenario file

The repository SHALL contain a dedicated Playwright spec file (`e2e/specs/screenshots.spec.ts`) whose sole responsibility is staging the SPA into canonical views and capturing screenshots. The file MUST NOT contain functional assertions unrelated to capture, and MUST NOT be imported or referenced from functional spec files.

#### Scenario: Screenshot spec exists at the expected path

- **WHEN** the repository is inspected
- **THEN** `e2e/specs/screenshots.spec.ts` exists
- **AND** its tests' final action for each captured view is `page.screenshot(...)` writing into `docs/screenshots/`

---

### Requirement: Canonical view set

The screenshot scenario SHALL capture exactly the following five canonical views, each written to a fixed file name under `docs/screenshots/`:

| File | View |
| --- | --- |
| `message-list.png` | Populated message list, no overlay |
| `reader.png` | A representative message open in the reader |
| `accounts.png` | Account list / picker |
| `compose.png` | Compose view with realistic draft content |
| `about-over-list.png` | About dialog overlaid on the message list |

#### Scenario: All five PNGs are produced

- **WHEN** `deno task screenshots` completes successfully
- **THEN** all five files listed above exist under `docs/screenshots/`
- **AND** no other PNG files are produced under `docs/screenshots/` by the task

#### Scenario: About shot uses the real About dialog

- **WHEN** `about-over-list.png` is captured
- **THEN** the visible About surface is rendered by the real `About.svelte` component triggered via its production entry point (keyboard shortcut, command palette, or menu)
- **AND** no test-only overlay or mock About panel is injected

---

### Requirement: On-demand-only execution

The screenshot scenario SHALL run only when explicitly requested via the dedicated task. It MUST NOT execute as part of the default `deno task test:e2e` / `deno task e2e:headless` run, MUST NOT execute in any CI workflow's default test step, and MUST NOT be added to a pre-commit or pre-push hook.

#### Scenario: Default e2e run excludes screenshot scenario

- **WHEN** `deno task test:e2e` is invoked
- **THEN** `e2e/specs/screenshots.spec.ts` is not executed
- **AND** no files under `docs/screenshots/` are written or modified by the run

#### Scenario: CI does not run the screenshot scenario by default

- **WHEN** the project's CI workflows are inspected
- **THEN** no workflow step invokes the screenshot project, task, or spec file as part of its default execution path
- **AND** if any workflow does invoke it, that invocation is gated behind an explicit opt-in (manual dispatch, dedicated workflow, or label-triggered job)

#### Scenario: Screenshot task runs the scenario

- **WHEN** `deno task screenshots` is invoked
- **THEN** Playwright executes the dedicated `screenshots` project containing only `e2e/specs/screenshots.spec.ts`
- **AND** the process exit code reflects success or failure of that scenario

---

### Requirement: Deterministic capture environment

The screenshot scenario SHALL fix the capture environment so re-runs against unchanged UI code produce stable output. Fixed parameters MUST include viewport dimensions, color scheme, locale, and device scale factor. Animations and caret blink SHALL be suppressed before capture.

#### Scenario: Environment is pinned in config

- **WHEN** the screenshot Playwright project's configuration is inspected
- **THEN** it specifies an explicit viewport width and height, a fixed `colorScheme`, a fixed `locale`, and a fixed `deviceScaleFactor`

#### Scenario: Animations are suppressed before capture

- **WHEN** any of the five views is captured
- **THEN** CSS transitions, animations, and caret blink are disabled on the page before `page.screenshot(...)` is called

---

### Requirement: Committed output under docs/screenshots/

The five PNGs SHALL be committed to the repository under `docs/screenshots/`. They MUST NOT be listed in `.gitignore`. The output directory MUST be `docs/screenshots/` (not `e2e/screenshots/`, not `e2e/test-results/`).

#### Scenario: Output directory is tracked

- **WHEN** the repository is inspected
- **THEN** `docs/screenshots/` exists and contains the five canonical PNGs as tracked files
- **AND** neither `docs/screenshots/` nor `docs/screenshots/*.png` appears in any `.gitignore`

---

### Requirement: Reuse of existing E2E harness

The screenshot scenario SHALL obtain its server, cloned maildir, and page objects through the existing harness fixture (`e2e/harness/fixtures.ts`). It MUST NOT clone fixtures, spawn `mailbrus-server`, or hard-code DOM selectors inline; selectors SHALL come from existing page objects (`AccountsPage`, `MailboxPage`, `MessagePage`) or new page-object additions where genuinely needed.

#### Scenario: Scenario delegates to harness and page objects

- **WHEN** `e2e/specs/screenshots.spec.ts` is inspected
- **THEN** it imports its `test` fixture from the harness rather than `@playwright/test` directly
- **AND** it interacts with the SPA via page objects, not raw `page.locator(...)` selectors duplicated from page objects

---

### Requirement: Manifest-driven content for list and reader shots

For the `message-list.png` and `reader.png` views, the content shown SHALL be sourced from the typed fixture manifest in `e2e/fixtures/manifest.ts` (specific account / folder / message references), so corpus changes propagate to the screenshots through the manifest rather than through scattered literals.

#### Scenario: List and reader shots reference manifest entries

- **WHEN** the screenshot scenario stages the message-list and reader views
- **THEN** the account, folder, and message it navigates to are obtained from named exports of the manifest, not from inline string literals
