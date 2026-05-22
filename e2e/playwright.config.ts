import { defineConfig } from '@playwright/test';

/**
 * Playwright config for the Mailbrus E2E suite.
 *
 * `webServer` is intentionally NOT set: the harness owns server lifecycles
 * (one freshly indexed `mailbrus-server` per test, see `harness/fixtures.ts`).
 * Browsers come from Nix (`PLAYWRIGHT_BROWSERS_PATH`) in the devShell/CI.
 */
export default defineConfig({
	testDir: './specs',
	// Keep run artifacts under e2e/ (gitignored), not at the repo root.
	outputDir: './test-results',
	globalSetup: './harness/global-setup.ts',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	// Each test clones + indexes + spawns a server; cap concurrency so a machine
	// is not overwhelmed by parallel notmuch/server processes.
	workers: process.env.CI ? 2 : 4,
	timeout: 45_000,
	expect: { timeout: 10_000 },
	reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
	use: {
		// Determinism: no service-worker caching of API responses between actions.
		serviceWorkers: 'block',
		actionTimeout: 10_000,
		navigationTimeout: 20_000,
		trace: 'retain-on-failure'
	},
	projects: [{ name: 'chromium', use: { browserName: 'chromium' } }]
});
