# e2e-test-harness

## Purpose

The Playwright test harness that provisions a fully isolated, per-test environment for the mailbrus E2E suite: cloning the pristine maildir corpus, building a scoped notmuch index, spawning a health-checked `mailbrus-server` instance, exposing its base URL to the test, and guaranteeing teardown. It also performs run-level prerequisite verification (built SPA, server binary, required tools).

---

## Requirements

### Requirement: Per-test fixture clone

The harness SHALL, before each test, copy the pristine maildir corpus into a fresh unique temporary directory, and the test SHALL operate exclusively against that clone.

#### Scenario: Each test gets a fresh clone

- **WHEN** a test starts
- **THEN** the harness creates a new temporary directory containing a copy of the pristine corpus
- **AND** two tests running concurrently use distinct clone directories

### Requirement: Scoped notmuch config and indexing

For each clone, the harness SHALL write a notmuch config whose `database.path` points at the clone, and SHALL index the clone by running `notmuch new` with `NOTMUCH_CONFIG` set to that config.

#### Scenario: Clone is indexed before the test body runs

- **WHEN** the clone has been created
- **THEN** the harness writes a scoped notmuch config rooted at the clone
- **AND** runs `notmuch new` with `NOTMUCH_CONFIG` pointing at that config
- **AND** indexing completes successfully before the test body executes

#### Scenario: Maildir flags become notmuch tags

- **WHEN** the clone is indexed
- **THEN** unread/flagged/replied/deleted states from maildir filenames are reflected as the corresponding notmuch tags

### Requirement: Hermetic isolation

The harness SHALL guarantee that neither indexing nor the server reads or writes the developer's real notmuch configuration or mailbox. `NOTMUCH_CONFIG` SHALL be set explicitly for both the indexer and the server process, and the harness SHALL verify the resolved database path is inside the temporary clone before running the test body.

#### Scenario: Resolved database is inside the clone

- **WHEN** the server and indexer are configured for a test
- **THEN** `NOTMUCH_CONFIG` is set explicitly for both processes
- **AND** the resolved notmuch `database.path` is a path inside the test's temporary clone

#### Scenario: Developer mailbox untouched

- **WHEN** the suite runs
- **THEN** no test reads from or writes to the developer's `~/.notmuch-config` or real maildir

### Requirement: Server lifecycle with health check

The harness SHALL spawn `mailbrus-server` bound to a per-test free port with `--frontend-dist` pointing at the built SPA, and SHALL wait until the server responds successfully (e.g. `GET /api/maildirs` returns 200) before exposing it to the test.

#### Scenario: Server is healthy before test runs

- **WHEN** the harness spawns the server for a test
- **THEN** it polls the API until a successful response is received
- **AND** the test body only runs after the server is confirmed ready

#### Scenario: Distinct ports for concurrent servers

- **WHEN** two tests run in parallel
- **THEN** each server is bound to a distinct free port
- **AND** neither fails to bind due to a port collision

### Requirement: Base URL exposed to the test

The harness SHALL expose the running server's base URL to the test (as a Playwright fixture value) so the browser navigates to the correct per-test instance.

#### Scenario: Test receives its server base URL

- **WHEN** a test requests the harness fixture
- **THEN** it receives the base URL of its own dedicated server instance

### Requirement: Guaranteed teardown and clone deletion

After each test, regardless of pass or fail, the harness SHALL terminate the server process and recursively delete the temporary clone.

#### Scenario: Cleanup on success

- **WHEN** a test passes
- **THEN** its server process is terminated and its temporary clone is deleted

#### Scenario: Cleanup on failure

- **WHEN** a test fails or throws during setup or execution
- **THEN** its server process is still terminated and its temporary clone is still deleted

### Requirement: Build prerequisites verified once per run

A global setup SHALL verify (and if necessary produce) the prerequisites shared across tests — the built SPA (`build/`) and the `mailbrus-server` binary — and SHALL fail fast with a clear message if a required tool (notmuch, Playwright browsers) is missing.

#### Scenario: Prerequisites present

- **WHEN** the suite starts
- **THEN** the built SPA and the server binary are available before any test runs

#### Scenario: Missing tool fails fast

- **WHEN** notmuch or the required browser is not available
- **THEN** the suite stops during setup with a clear, actionable error message
