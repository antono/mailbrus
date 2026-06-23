/**
 * Sync status bar (redesign): compact idle dot that morphs dot → "Sync now"
 * button → spinner → event-log popup, with a timestamped event log and
 * error-state styling.
 *
 * Sync is driven against a real backend, never mocked. Morph/error tests use the
 * default fixture (whose `imap.invalid` accounts make a triggered sync fail fast,
 * which is exactly what the error-state assertions want). The event-log content
 * test uses a real Stalwart sidecar with a `plain`-credential account so the
 * pre-auth lifecycle events (`checking_password` → `password_retrieved` →
 * `connecting`) actually fire. Stalwart 0.15.5 refuses cleartext auth, so the run
 * still terminates in `error` before fetch/index — tests that need a *completing*
 * sync (fetched/indexed/sync_completed, populated history) stay `test.fixme`.
 */
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { test, expect } from '../harness/fixtures.ts';
import { cloneCorpus, removeClone, type Clone } from '../harness/clone.ts';
import { writeFixtureConfig, addAccountToml, type ConfigEntry } from '../harness/config.ts';
import { indexClone } from '../harness/notmuch.ts';
import { startServer, type ServerHandle } from '../harness/server.ts';
import { startStalwart, type StalwartHandle } from '../harness/stalwart.ts';

// openspec/changes/sync-status-bar-redesign/specs/sync-status-compact-ui/spec.md: idle dot shown at rest
test('idle dot is visible at startup and the spinner/button are not', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByTestId('status-bar.container')).toBeVisible();
	await expect(page.getByTestId('status-bar.idle')).toBeVisible();
	await expect(page.getByTestId('status-bar.sync-btn')).toHaveCount(0);
	await expect(page.getByTestId('status-bar.spinner')).toHaveCount(0);
	await expect(page.getByTestId('status-bar.popup')).toHaveCount(0);
});

// openspec/changes/sync-status-bar-redesign/specs/sync-status-compact-ui/spec.md: idle dot morphs to a clickable Sync button
test('clicking the idle dot morphs it into a clickable "Sync now" button', async ({ page }) => {
	await page.goto('/');
	await page.getByTestId('status-bar.idle').click();

	const btn = page.getByTestId('status-bar.sync-btn');
	await expect(btn).toBeVisible();
	await expect(btn).toBeEnabled();
	await expect(page.getByTestId('status-bar.idle')).toHaveCount(0);
});

// openspec/changes/sync-status-bar-redesign/specs/sync-status-compact-ui/spec.md: Sync button starts sync and morphs to spinner
test('clicking the Sync button starts a sync and morphs to a spinner', async ({ page }) => {
	await page.goto('/');
	await page.getByTestId('status-bar.idle').click();
	await page.getByTestId('status-bar.sync-btn').click();
	// requestSync() flips `started` synchronously, so the spinner appears at once.
	await expect(page.getByTestId('status-bar.spinner')).toBeVisible();
});

// openspec/changes/sync-status-bar-redesign/specs/sync-status-compact-ui/spec.md: spinner opens the event-log popup
test('clicking the spinner opens the event-log popup', async ({ page }) => {
	await page.goto('/');
	await page.getByTestId('status-bar.idle').click();
	await page.getByTestId('status-bar.sync-btn').click();
	await page.getByTestId('status-bar.spinner').click();

	const popup = page.getByTestId('status-bar.popup');
	await expect(popup).toBeVisible();
	// Closing returns to no-popup.
	await page.getByTestId('status-bar.close-btn').click();
	await expect(popup).toHaveCount(0);
});

// openspec/changes/sync-status-bar-redesign/specs/sync-status-compact-ui/spec.md: spinner returns to idle after the run ends
test('spinner returns to the idle dot after the sync run finishes', async ({ page }) => {
	await page.goto('/');
	await page.getByTestId('status-bar.idle').click();
	await page.getByTestId('status-bar.sync-btn').click();
	await expect(page.getByTestId('status-bar.spinner')).toBeVisible();
	// The fixture's imap.invalid account fails fast → run terminates → back to idle.
	await expect(page.getByTestId('status-bar.idle')).toBeVisible({ timeout: 30_000 });
	await expect(page.getByTestId('status-bar.spinner')).toHaveCount(0);
});

// openspec/changes/sync-status-bar-redesign/specs/sync-status-compact-ui/spec.md: error state styling on a failed sync
test('a failed sync surfaces the error-state dot', async ({ page }) => {
	await page.goto('/');
	await page.getByTestId('status-bar.idle').click();
	await page.getByTestId('status-bar.sync-btn').click();
	// The credential/connection failure marks the run errored; the dot returns
	// styled as an error (data-testid stays `status-bar.idle`, with the error class).
	const dot = page.getByTestId('status-bar.idle');
	await expect(dot).toBeVisible({ timeout: 30_000 });
	await expect(dot.locator('.mb-status-dot.is-error')).toBeVisible({ timeout: 30_000 });
});

// openspec/changes/sync-status-bar-redesign/specs/sync-event-log/spec.md: event log shows timestamped lifecycle events
test('event log records timestamped lifecycle events for a real sync', async () => {
	let clone: Clone | undefined;
	let stalwart: StalwartHandle | undefined;
	let server: ServerHandle | undefined;
	try {
		clone = await cloneCorpus();
		const scope = await indexClone(clone);
		stalwart = await startStalwart({
			users: [{ email: 'alice@test.local', secret: 'stalwart-secret' }]
		});

		const base = await writeFixtureConfig(clone);
		const maildir = join(clone.maildir, 'alice@test.local');
		await mkdir(maildir, { recursive: true });
		const entry: ConfigEntry = { id: 'alice@test.local', maildirRoot: maildir };
		await addAccountToml(base.accountsDir, {
			...entry,
			toml: [
				'protocol = "imap"',
				'email = "alice@test.local"',
				'imap_host = "127.0.0.1"',
				`imap_port = ${stalwart.imapPort}`,
				'imap_tls = false',
				'credential_backend = "plain"',
				'credential_ref = "stalwart-secret"',
				`maildir_root = "${maildir}"`,
				''
			].join('\n')
		});
		server = await startServer({
			scope,
			clone,
			config: { path: base.path, accountsDir: base.accountsDir, entries: [...base.entries, entry] }
		});

		const { chromium } = await import('@playwright/test');
		const browser = await chromium.launch();
		const page = await browser.newPage();
		try {
			await page.goto(`${server.baseURL}/`);
			// Morph dot → button → spinner, then open the popup so live events show.
			await page.getByTestId('status-bar.idle').click();
			await page.getByTestId('status-bar.sync-btn').click();
			await page.getByTestId('status-bar.spinner').click();
			await expect(page.getByTestId('status-bar.popup')).toBeVisible();

			// Pre-auth lifecycle events fire for a plain-credential account even though
			// Stalwart then refuses cleartext auth (run ends in sync_failed). `Sync now`
			// triggers all configured accounts, so scope assertions to the stalwart one.
			const rows = page.getByTestId('status-bar.event-row');
			await expect(rows.first()).toBeVisible({ timeout: 20_000 });
			const stalwartRows = rows.filter({ hasText: 'alice@test.local' });
			// A timestamped `checking_password (plain)` row for our account proves the
			// full pipeline: server lifecycle event → SSE → event log → popup render.
			await expect(
				stalwartRows.filter({ hasText: 'checking_password' }).first()
			).toBeVisible({ timeout: 20_000 });
			await expect(stalwartRows.first()).toContainText(/\d\d:\d\d:\d\d/);
		} finally {
			await browser.close();
		}
	} finally {
		if (server) await server.stop();
		if (stalwart) await stalwart.stop();
		await removeClone(clone);
	}
});

// openspec/changes/sync-status-bar-redesign/specs/sync-event-log/spec.md: clear-history removes archived runs (needs ≥2 runs)
//
// The "Clear history" button only appears once a prior run has been archived,
// which requires a second sync to roll the first run into history. With the
// cleartext-auth limitation both runs error, but archival still occurs on the
// second requestSync — enable once the morph timing under back-to-back errored
// runs is stable enough to drive deterministically in CI.
test.fixme('clear-history button removes archived runs after confirmation', async ({ page }) => {
	const dialogs: string[] = [];
	page.on('dialog', (d) => {
		dialogs.push(d.message());
		d.accept();
	});
	await page.goto('/');
	// (sync twice so run #1 is archived, open popup, assert History visible, then
	//  click status-bar.clear-history and assert the section disappears.)
	await expect(page.getByTestId('status-bar.history')).toHaveCount(0);
});

// openspec/changes/sync-status-bar-redesign/specs/sync-event-log/spec.md: completing sync populates fetched/indexed/sync_completed
//
// Needs a sync that authenticates and fetches. Stalwart 0.15.5 refuses cleartext
// IMAP auth, so the run errors before the fetch/index phase. Enable once a
// TLS-capable Stalwart listener (or confirmed cleartext opt-in) lands.
test.fixme('event log shows fetched/indexed/sync_completed for a completing sync', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByTestId('status-bar.popup')).toHaveCount(0);
});
