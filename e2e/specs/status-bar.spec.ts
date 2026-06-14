/**
 * Desktop status bar: idle indicator, click-to-open progress popup, and (when a
 * sync is live) the spinner + per-account rows.
 */
import { test, expect } from '../harness/fixtures.ts';

// openspec/changes/mailbrus-notmuch-database/specs/notmuch-database/spec.md: Indexing progress — desktop UI spinner
test('status bar is present and its popup toggles open', async ({ page }) => {
	await page.goto('/');

	const container = page.getByTestId('status-bar.container');
	await expect(container).toBeVisible();

	// Idle by default: the idle dot is shown, not the spinner.
	await expect(page.getByTestId('status-bar.idle')).toBeVisible();
	await expect(page.getByTestId('status-bar.spinner')).toHaveCount(0);

	// Clicking the toggle opens the progress popup; with no activity yet it shows
	// the empty-state message.
	await page.getByTestId('status-bar.toggle').click();
	await expect(page.getByTestId('status-bar.popup')).toBeVisible();
	await expect(page.getByTestId('status-bar.empty')).toBeVisible();

	// Closing the popup hides it again.
	await page.getByTestId('status-bar.close-btn').click();
	await expect(page.getByTestId('status-bar.popup')).toHaveCount(0);
});

// openspec/changes/mailbrus-notmuch-database/specs/notmuch-database/spec.md: Spinner appears during active indexing
//
// Showing the spinner and populated per-account rows requires a sync that stays
// `running` long enough to observe and that reaches the indexing phase. The
// per-test harness has no live IMAP backend that authenticates, so a triggered
// sync flips from `running` to `error` almost immediately and never indexes.
// Enable once a TLS-capable Stalwart (or equivalent) supports a completing sync.
test.fixme('spinner shows during an active sync and popup lists the account', async ({
	app,
	page
}) => {
	const account = app.config.entries[0].id;
	await page.goto('/');
	await fetch(`${app.baseURL}/api/sync/${encodeURIComponent(account)}`, { method: 'POST' });

	await expect(page.getByTestId('status-bar.spinner')).toBeVisible();
	await page.getByTestId('status-bar.toggle').click();
	await expect(page.getByTestId('status-bar.row').filter({ has: page.locator(`[data-account="${account}"]`) })).toBeVisible();
});
