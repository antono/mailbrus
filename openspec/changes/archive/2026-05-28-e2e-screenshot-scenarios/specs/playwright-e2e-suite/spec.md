## MODIFIED Requirements

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
