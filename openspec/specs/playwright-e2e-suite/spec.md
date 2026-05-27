# playwright-e2e-suite

## Purpose

The Playwright end-to-end test suite for the mailbrus frontend: its file organization (config, fixtures, harness, page objects, specs), its runnable task entry point, and the functional coverage it provides — maildir/account listing, folder navigation, pagination, message reading, attachment rendering, and signature-state rendering — with assertions driven by the typed fixture manifest.

---

## Requirements

### Requirement: Defined file organization

The E2E suite SHALL follow a fixed, documented layout separating Playwright configuration, fixtures (corpus + manifest), harness, page objects, and specs. Spec files SHALL contain test logic only and SHALL delegate setup to the harness and locators to page objects.

#### Scenario: Layout present and documented

- **WHEN** the E2E directory is inspected
- **THEN** distinct locations exist for config, fixtures, harness, page objects, and specs
- **AND** a README documents how to run the suite and how to add fixtures and specs

#### Scenario: Specs contain no inline setup

- **WHEN** a spec file is inspected
- **THEN** it obtains its server via the harness fixture and its locators via page objects
- **AND** it does not clone fixtures, spawn servers, or hard-code DOM selectors inline

### Requirement: Runnable task

The suite SHALL be runnable through a single project task (e.g. `deno task test:e2e`) that ensures prerequisites and executes the Playwright tests, suitable for both local and CI use. The default task SHALL execute only functional specs; on-demand scenarios (such as screenshot capture under [[e2e-screenshots]]) MUST be gated behind separate, explicitly invoked tasks and MUST NOT be included in the default `test:e2e` execution set or in any CI workflow's default test step.

#### Scenario: Suite runs via task

- **WHEN** the E2E task is invoked
- **THEN** prerequisites are ensured and the Playwright tests execute
- **AND** the process exit code reflects pass/fail of the suite

#### Scenario: Default task excludes on-demand scenarios

- **WHEN** `deno task test:e2e` is invoked
- **THEN** only functional spec files execute
- **AND** spec files belonging to on-demand-only Playwright projects (e.g. the screenshot project) are not executed

#### Scenario: On-demand scenarios have their own task

- **WHEN** an on-demand-only Playwright project exists in the suite
- **THEN** the project is invokable via a dedicated, named task (e.g. `deno task screenshots`)
- **AND** that task is documented alongside `test:e2e` in the project README or AGENTS/CLAUDE docs

### Requirement: Assertions reference the manifest

Specs SHALL assert against the typed fixture manifest rather than hard-coded message literals, so corpus changes propagate to expectations through the manifest.

#### Scenario: Expected values come from the manifest

- **WHEN** a spec asserts on accounts, folders, counts, or message attributes
- **THEN** the expected values are derived from the manifest, not inline literals

### Requirement: Maildir listing coverage

The suite SHALL verify that the UI lists the accounts present in the corpus.

#### Scenario: Accounts are listed

- **WHEN** the app loads
- **THEN** every account in the manifest is shown in the UI

### Requirement: Folder navigation coverage

The suite SHALL verify that selecting an account shows its folders and that selecting a folder lists that folder's messages.

#### Scenario: Folders shown for an account

- **WHEN** an account is selected
- **THEN** the folders defined for that account in the manifest are shown

#### Scenario: Messages shown for a folder

- **WHEN** a folder is selected
- **THEN** the messages the manifest places in that folder are listed

### Requirement: Pagination coverage

The suite SHALL verify message-list pagination: navigating between pages shows the expected messages and the page/per-page/count indicators are correct.

#### Scenario: Navigating pages

- **WHEN** a folder with more messages than one page is opened and the next page is requested
- **THEN** the next set of messages is shown
- **AND** the page, per-page, and total-count indicators match the manifest

### Requirement: Message reading coverage

The suite SHALL verify opening a message renders its headers and body, and that read/unread state is reflected in the UI.

#### Scenario: Message opens with headers and body

- **WHEN** a message is opened
- **THEN** its subject, sender, and body are rendered as described in the manifest

#### Scenario: Unread becomes read

- **WHEN** an unread message is opened
- **THEN** the UI reflects it as read

### Requirement: Attachment rendering coverage

The suite SHALL verify that messages with attachments display their attachments and that messages without attachments display none.

#### Scenario: Attachments listed

- **WHEN** a message with attachments is opened
- **THEN** each attachment described in the manifest is shown

#### Scenario: No attachments shown

- **WHEN** a message without attachments is opened
- **THEN** no attachments are shown

### Requirement: Signature state rendering coverage

The suite SHALL verify the UI distinguishes signed, unsigned, and broken-signature messages.

#### Scenario: Signed message indicated

- **WHEN** a validly signed message is opened
- **THEN** the UI presents its signed state as described in the manifest

#### Scenario: Broken signature indicated

- **WHEN** a message with a broken signature is opened
- **THEN** the UI presents a broken/invalid signature state distinct from both signed and unsigned

#### Scenario: Unsigned message indicated

- **WHEN** an unsigned message is opened
- **THEN** the UI presents no signature indication
