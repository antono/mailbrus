/** In-app sync trigger: the StatusBar morph (idle dot → "Sync now" → spinner) issues POST /api/sync. */
import { test, expect } from '../harness/fixtures.ts';

// openspec/specs/sveltekit-ui/spec.md: Sync now from the status bar issues POST /api/sync
test('"Sync now" button issues POST /api/sync', async ({ page }) => {
	await page.goto('/');

	// idle dot → "Sync now" button (redesigned progressive-disclosure control).
	await page.getByTestId('status-bar.idle').click();
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

// openspec/changes/sync-status-bar-redesign/specs/sync-status-compact-ui/spec.md: button morphs to spinner on click
//
// requestSync() sets started=true synchronously, so the button is immediately
// replaced by the spinner — the optimistic "in flight" state. There is no second
// "Sync now" button to click, which is what prevents a double-trigger (the old UI
// expressed this as a disabled button).
test('clicking "Sync now" morphs to the spinner immediately', async ({ page }) => {
	await page.goto('/');
	await page.getByTestId('status-bar.idle').click();
	await page.getByTestId('status-bar.sync-btn').click();

	await expect(page.getByTestId('status-bar.spinner')).toBeVisible();
	await expect(page.getByTestId('status-bar.sync-btn')).toHaveCount(0);
});
