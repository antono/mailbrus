/** List-scope `g X` leader sequences resolve folder names case-insensitively. */
import { test, expect } from '../harness/fixtures.ts';
import { AccountsPage } from '../pages/AccountsPage.ts';
import { MailboxPage } from '../pages/MailboxPage.ts';
import { manifest } from '../fixtures/manifest.ts';

const alice = manifest.find((a) => a.address === 'alice@example.com')!;

async function openAtArchive(page: import('@playwright/test').Page) {
	const accounts = new AccountsPage(page);
	await accounts.open();
	await accounts.select(alice.address);
	const mailbox = new MailboxPage(page);
	await mailbox.openFolder('Archive');
	await expect(page).toHaveURL(/\/folder\/Archive/);
}

// openspec/changes/isolate-hotkeys/specs/ui-hotkeys/spec.md: list `g i` -> Inbox
test('g i navigates to Inbox', async ({ page }) => {
	await openAtArchive(page);
	await page.keyboard.press('g');
	await page.keyboard.press('i');
	await expect(page).toHaveURL(/\/folder\/Inbox/);
});

// openspec/changes/isolate-hotkeys/specs/ui-hotkeys/spec.md: list `g a` -> Archive
test('g a navigates to Archive', async ({ page }) => {
	const accounts = new AccountsPage(page);
	await accounts.open();
	await accounts.select(alice.address);
	const mailbox = new MailboxPage(page);
	await mailbox.openFolder('Inbox');
	await page.keyboard.press('g');
	await page.keyboard.press('a');
	await expect(page).toHaveURL(/\/folder\/Archive/);
});

// openspec/changes/isolate-hotkeys/specs/ui-hotkeys/spec.md: list `g s` -> Sent
test('g s navigates to Sent', async ({ page }) => {
	await openAtArchive(page);
	await page.keyboard.press('g');
	await page.keyboard.press('s');
	await expect(page).toHaveURL(/\/folder\/Sent/);
});

// openspec/changes/isolate-hotkeys/specs/ui-hotkeys/spec.md: list `g f` -> Folder picker
test('g f opens the folder picker', async ({ page }) => {
	await openAtArchive(page);
	await page.keyboard.press('g');
	await page.keyboard.press('f');
	await expect(page.getByText('Open a folder')).toBeVisible();
});

// openspec/changes/isolate-hotkeys/specs/ui-hotkeys/spec.md: list `g A` -> Account picker
test('g A opens the account picker', async ({ page }) => {
	await openAtArchive(page);
	await page.keyboard.press('g');
	await page.keyboard.press('Shift+A');
	await expect(page.getByText('Open a maildir')).toBeVisible();
});

// openspec/changes/isolate-hotkeys/specs/ui-hotkeys/spec.md: list `g d` -> Drafts (silent no-op if absent)
test('g d does nothing when the account has no Drafts folder', async ({ page }) => {
	await openAtArchive(page);
	await page.keyboard.press('g');
	await page.keyboard.press('d');
	// alice has no Drafts folder in the corpus — URL stays on Archive.
	await expect(page).toHaveURL(/\/folder\/Archive/);
});
