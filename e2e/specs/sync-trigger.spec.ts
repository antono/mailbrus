/** In-app sync trigger: the StatusBar "Sync now" button issues POST /api/sync. */
import { test, expect } from '../harness/fixtures.ts';

// openspec/changes/ui-sync-trigger/specs/sveltekit-ui/spec.md: Sync now from the status bar
test('"Sync now" button issues POST /api/sync', async ({ page }) => {
	await page.goto('/');

	await page.getByTestId('status-bar.toggle').click();
	const syncBtn = page.getByTestId('status-bar.sync-btn');
	await expect(syncBtn).toBeVisible();
	await expect(syncBtn).toBeEnabled();

	const request = page.waitForRequest(
		(r) => r.method() === 'POST' && /\/api\/sync$/.test(new URL(r.url()).pathname)
	);
	await syncBtn.click();
	const req = await request;
	expect(req.method()).toBe('POST');
});

// openspec/changes/ui-sync-trigger/specs/sveltekit-ui/spec.md: Trigger is disabled while a sync is in flight
//
// Observing the disabled state requires a sync that stays `running` long enough
// to assert against. The per-test harness has no live IMAP backend that
// authenticates, so a triggered sync flips from `running` to `error` almost
// immediately. Enable once a completing sync is available in the harness.
test.fixme('"Sync now" is disabled while a sync is in flight', async ({ page }) => {
	await page.goto('/');
	await page.getByTestId('status-bar.toggle').click();
	await page.getByTestId('status-bar.sync-btn').click();
	await expect(page.getByTestId('status-bar.sync-btn')).toBeDisabled();
});
