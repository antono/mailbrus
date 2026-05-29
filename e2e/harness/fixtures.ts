/**
 * Playwright test fixtures wiring the per-test lifecycle:
 * clone -> index -> spawn server -> expose base URL -> guaranteed teardown.
 *
 * Specs import `test`/`expect` from here. Setup and teardown live entirely in
 * the `app` fixture, so the clone is deleted and the server stopped on both
 * pass and fail (`finally`). The `baseURL` override lets specs use relative
 * navigation (`page.goto('/')`).
 */
import { test as base, expect } from '@playwright/test';
import { cloneCorpus, removeClone, type Clone } from './clone.ts';
import { writeFixtureConfig, type ConfigHandle } from './config.ts';
import { indexClone } from './notmuch.ts';
import { startServer, type ServerHandle } from './server.ts';

export interface AppFixture {
	/** Base URL of this test's dedicated, freshly indexed server instance. */
	baseURL: string;
	/** Account list materialised into the test's mailbrus config.toml. */
	config: ConfigHandle;
}

export const test = base.extend<{ app: AppFixture; config: ConfigHandle }>({
	app: async ({}, use) => {
		let clone: Clone | undefined;
		let server: ServerHandle | undefined;
		try {
			clone = await cloneCorpus();
			const scope = await indexClone(clone);
			const config = await writeFixtureConfig(clone);
			server = await startServer({ scope, clone, config });
			await use({ baseURL: server.baseURL, config });
		} finally {
			if (server) await server.stop();
			await removeClone(clone);
		}
	},
	// Point Playwright's page/context at this test's server.
	baseURL: async ({ app }, use) => {
		await use(app.baseURL);
	},
	// Expose the generated mailbrus config to specs that need it.
	config: async ({ app }, use) => {
		await use(app.config);
	}
});

export { expect };
