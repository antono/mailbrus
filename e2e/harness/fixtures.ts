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
import { indexClone } from './notmuch.ts';
import { startServer, type ServerHandle } from './server.ts';

export interface AppFixture {
	/** Base URL of this test's dedicated, freshly indexed server instance. */
	baseURL: string;
}

export const test = base.extend<{ app: AppFixture }>({
	app: async ({}, use) => {
		let clone: Clone | undefined;
		let server: ServerHandle | undefined;
		try {
			clone = await cloneCorpus();
			const scope = await indexClone(clone);
			server = await startServer(scope);
			await use({ baseURL: server.baseURL });
		} finally {
			if (server) await server.stop();
			await removeClone(clone);
		}
	},
	// Point Playwright's page/context at this test's server.
	baseURL: async ({ app }, use) => {
		await use(app.baseURL);
	}
});

export { expect };
