/** auth-bootstrap: browser token entry, stale-token recovery, and desktop injection. */
import { test, expect } from '../harness/fixtures.ts';
import { cloneCorpus, removeClone, type Clone } from '../harness/clone.ts';
import { writeFixtureConfig } from '../harness/config.ts';
import { indexClone } from '../harness/notmuch.ts';
import { reserveFreePort, startServer, type ServerHandle } from '../harness/server.ts';

/** A freshly cloned, indexed server, optionally under `--auth` and on a fixed port. */
async function startAuthedServer(
	auth?: string,
	port?: number
): Promise<{ clone: Clone; server: ServerHandle }> {
	const clone = await cloneCorpus();
	const scope = await indexClone(clone);
	const config = await writeFixtureConfig(clone);
	const server = await startServer({ scope, clone, config, auth, port });
	return { clone, server };
}

// openspec/changes/tauri-token-injection/specs/frontend-auth-bootstrap/spec.md: missing token forces the auth screen; a valid token unlocks the app
test('browser bootstrap: auth screen gates the app, wrong token rejected, correct token unlocks', async ({
	page
}) => {
	const token = 'e2e-bootstrap-token';
	let clone: Clone | undefined;
	let server: ServerHandle | undefined;
	try {
		({ clone, server } = await startAuthedServer(token));
		await page.goto(server.baseURL);

		// No token yet → the blocking auth screen stands in for the app.
		await expect(page.getByTestId('auth.screen')).toBeVisible();
		await expect(page.getByText('Open a maildir')).toHaveCount(0);

		// A wrong token is rejected and keeps the screen up.
		await page.getByTestId('auth.token-input').fill('not-the-token');
		await page.getByTestId('auth.submit').click();
		await expect(page.getByTestId('auth.error')).toBeVisible();
		await expect(page.getByTestId('auth.screen')).toBeVisible();

		// The correct token unlocks the app.
		await page.getByTestId('auth.token-input').fill(token);
		await page.getByTestId('auth.submit').click();
		await expect(page.getByText('Open a maildir')).toBeVisible();
		await expect(page.getByTestId('auth.screen')).toHaveCount(0);
	} finally {
		if (server) await server.stop();
		await removeClone(clone);
	}
});

// openspec/changes/tauri-token-injection/specs/frontend-auth-bootstrap/spec.md: a mid-session 401 clears the stored token and re-shows the auth screen
test('stale token recovery: a rotated server 401s a live session back to the auth screen', async ({
	page
}) => {
	const tokenA = 'e2e-token-a';
	const tokenB = 'e2e-token-b';
	// Fixed port so the "rotated" server B reuses server A's authority.
	const port = await reserveFreePort();
	let cloneA: Clone | undefined;
	let cloneB: Clone | undefined;
	let serverA: ServerHandle | undefined;
	let serverB: ServerHandle | undefined;
	try {
		({ clone: cloneA, server: serverA } = await startAuthedServer(tokenA, port));
		await page.goto(serverA.baseURL);

		// Bootstrap with the valid token; the app renders.
		await page.getByTestId('auth.token-input').fill(tokenA);
		await page.getByTestId('auth.submit').click();
		await expect(page.getByText('Open a maildir')).toBeVisible();

		// The server "rotates": stop A, bring up B on the same authority with a
		// new token. The browser still holds token A in memory.
		await serverA.stop();
		serverA = undefined;
		({ clone: cloneB, server: serverB } = await startAuthedServer(tokenB, port));

		// A UI action issues an authed /api/* request → 401 → recovery.
		await page.getByTestId('accounts.curtain').getByTestId('palette.row').first().click();
		await expect(page.getByTestId('auth.screen')).toBeVisible();
	} finally {
		if (serverB) await serverB.stop();
		if (serverA) await serverA.stop();
		await removeClone(cloneA);
		await removeClone(cloneB);
	}
});

// openspec/changes/tauri-token-injection/specs/frontend-auth-bootstrap/spec.md: a server without --auth never shows the auth screen
test('no-auth server: the app loads directly and the auth screen is never shown', async ({ page }) => {
	// The default `app` fixture starts a token-less server.
	await page.goto('/');
	await expect(page.getByText('Open a maildir')).toBeVisible();
	await expect(page.getByTestId('auth.screen')).toHaveCount(0);
});

// openspec/changes/tauri-token-injection/specs/desktop-auth-token/spec.md: an injected token authenticates the SPA with no auth screen
test('injected token: the SPA authenticates automatically with no auth screen', async ({ page }) => {
	const token = 'e2e-injected-token';
	let clone: Clone | undefined;
	let server: ServerHandle | undefined;
	try {
		({ clone, server } = await startAuthedServer(token));
		// Mimic the desktop shell's initialization_script.
		await page.addInitScript((t) => {
			(window as unknown as { __MAILBRUS_AUTH_TOKEN__?: string }).__MAILBRUS_AUTH_TOKEN__ = t;
		}, token);
		await page.goto(server.baseURL);

		// App loads against the --auth server ⇒ /api/* carried the bearer token.
		await expect(page.getByText('Open a maildir')).toBeVisible();
		await expect(page.getByTestId('auth.screen')).toHaveCount(0);
	} finally {
		if (server) await server.stop();
		await removeClone(clone);
	}
});
