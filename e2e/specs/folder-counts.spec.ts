/**
 * Folder and account message counters are computed from the notmuch index, not
 * hardcoded to zero.
 *
 * Regression: `list_maildirs` / `list_folders` returned `total: 0, unread: 0`,
 * so the open-folder dialog (and the breadcrumb that reads the same data) showed
 * "0" for every folder including Inbox. The handlers now count via notmuch
 * (`folder:`/`path:` queries resolved against the database root).
 *
 * openspec/specs/mailbrus-server-crate/spec.md
 */
import { test, expect } from '../harness/fixtures.ts';
import { AccountsPage } from '../pages/AccountsPage.ts';
import { manifest } from '../fixtures/manifest.ts';

const alice = manifest.find((a) => a.address === 'alice@example.com')!;
const inboxSize = alice.folders.find((f) => f.name === 'Inbox')!.messages.length;

/** Trailing integer of a folder row's `.meta` (handles "u / t" and "t"). */
function lastInt(s: string | null): number {
	const m = (s ?? '').match(/(\d+)\s*$/);
	return m ? Number(m[1]) : NaN;
}

/** Largest integer appearing in a string (account meta is "N unread" or "t"). */
function maxInt(s: string | null): number {
	const nums = (s ?? '').match(/\d+/g)?.map(Number) ?? [];
	return nums.length ? Math.max(...nums) : NaN;
}

test('account picker shows a non-zero message count for the account', async ({ page }) => {
	const accounts = new AccountsPage(page);
	await accounts.open();
	const row = page
		.getByTestId('accounts.curtain')
		.getByTestId('palette.row')
		.filter({ has: page.getByText(alice.address, { exact: true }) })
		.first();
	// Meta is "<unread> unread" when unread > 0, otherwise the total — either way
	// a positive number proves the count is no longer hardcoded to 0.
	expect(maxInt(await row.locator('.meta').textContent())).toBeGreaterThan(0);
});

test('folder picker shows the real Inbox total', async ({ page }) => {
	const accounts = new AccountsPage(page);
	await accounts.open();
	await accounts.select(alice.address);
	await expect(page.getByText('Open a folder')).toBeVisible();

	const inboxRow = page
		.getByTestId('folders.curtain')
		.getByTestId('palette.row')
		.filter({ has: page.getByText('Inbox', { exact: true }) })
		.first();
	const total = lastInt(await inboxRow.locator('.meta').textContent());
	expect(total).toBe(inboxSize);
});
