/** List-scope g-leader: trimmed to navigation primitives (g f / g a / g g / G). */
import { test, expect } from '../harness/fixtures.ts';
import { AccountsPage } from '../pages/AccountsPage.ts';
import { MailboxPage } from '../pages/MailboxPage.ts';
import { folderOf, manifest, messagesNewestFirst, PER_PAGE } from '../fixtures/manifest.ts';

const alice = manifest.find((a) => a.address === 'alice@example.com')!;
const archive = folderOf(alice, 'Archive');

async function openArchive(page: import('@playwright/test').Page): Promise<MailboxPage> {
	const accounts = new AccountsPage(page);
	await accounts.open();
	await accounts.select(alice.address);
	const mailbox = new MailboxPage(page);
	await mailbox.openFolder('Archive');
	await expect(page).toHaveURL(/\/folder\/Archive/);
	// Park the cursor away from the rows — list rows set selectedIdx on
	// mouseenter, which would otherwise race the keyboard-driven selection.
	await page.mouse.move(0, 0);
	return mailbox;
}

// openspec/specs/ui-hotkeys/spec.md: g f opens the folder picker
test('g f opens the folder picker', async ({ page }) => {
	await openArchive(page);
	await page.keyboard.press('g');
	await page.keyboard.press('f');
	await expect(page.getByText('Open a folder')).toBeVisible();
});

// openspec/specs/ui-hotkeys/spec.md: g a opens the account picker
test('g a opens the account picker', async ({ page }) => {
	await openArchive(page);
	await page.keyboard.press('g');
	await page.keyboard.press('a');
	await expect(page.getByText('Open a maildir')).toBeVisible();
});

// openspec/specs/ui-hotkeys/spec.md: g g jumps to top of list
test('g g jumps the selection to the top of the list', async ({ page }) => {
	const mailbox = await openArchive(page);
	// Move the selection to the bottom (keyboard), then g g returns it to 0.
	await mailbox.jumpBottom();
	await expect.poll(() => mailbox.selectedIndex()).toBeGreaterThan(0);
	await mailbox.jumpTop();
	await expect.poll(() => mailbox.selectedIndex()).toBe(0);
});

// openspec/specs/ui-hotkeys/spec.md: G jumps to bottom of list
test('G jumps the selection to the bottom of the page', async ({ page }) => {
	const mailbox = await openArchive(page);
	// Archive has more messages than a page; G selects the last rendered row.
	const onPage = Math.min(messagesNewestFirst(archive).length, PER_PAGE);
	await mailbox.jumpBottom();
	await expect.poll(() => mailbox.selectedIndex()).toBe(onPage - 1);
});

// openspec/specs/ui-hotkeys/spec.md: removed follow-ups no longer navigate
test('removed leaders g i / g s / g d are no-ops', async ({ page }) => {
	await openArchive(page);
	for (const key of ['i', 's', 'd']) {
		await page.keyboard.press('g');
		await page.keyboard.press(key);
		// No folder navigation occurs — URL stays on Archive.
		await expect(page).toHaveURL(/\/folder\/Archive/);
	}
});
