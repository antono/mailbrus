/** Per-scope hotkey isolation — bindings declared for one scope do not fire in another. */
import { test, expect } from '../harness/fixtures.ts';
import { AccountsPage } from '../pages/AccountsPage.ts';
import { MailboxPage } from '../pages/MailboxPage.ts';
import { folderOf, manifest, messagesNewestFirst } from '../fixtures/manifest.ts';

const alice = manifest.find((a) => a.address === 'alice@example.com')!;
const inbox = folderOf(alice, 'Inbox');
const firstMessage = messagesNewestFirst(inbox)[0];

async function openMailbox(page: import('@playwright/test').Page) {
	const accounts = new AccountsPage(page);
	await accounts.open();
	await accounts.select(alice.address);
	const mailbox = new MailboxPage(page);
	await mailbox.openFolder('Inbox');
	return mailbox;
}

// openspec/changes/isolate-hotkeys/specs/ui-hotkeys/spec.md: List key does not fire in reader
test('/ in the reader does not open the list search bar', async ({ page }) => {
	const mailbox = await openMailbox(page);
	await mailbox.openMessage(firstMessage.subject);
	await page.keyboard.press('/');
	await expect(page.getByTestId('mail-list.search-input')).toHaveCount(0);
	await expect(page.getByTestId('reader.container')).toBeVisible();
});

// openspec/changes/isolate-hotkeys/specs/ui-hotkeys/spec.md: Reader key does not fire on list
test('J on the list does not move selection (J is a reader-scope binding)', async ({ page }) => {
	const mailbox = await openMailbox(page);
	const rows = page.getByTestId('mail-list.message-row');
	const firstRow = rows.first();
	await firstRow.hover();
	const classBefore = (await firstRow.getAttribute('class')) ?? '';
	await page.keyboard.press('Shift+J');
	// Give the dispatcher a tick to do nothing.
	await page.waitForTimeout(50);
	const classAfter = (await firstRow.getAttribute('class')) ?? '';
	expect(classAfter).toBe(classBefore);
});

// openspec/changes/isolate-hotkeys/specs/ui-hotkeys/spec.md: Compose key does not fire on list
test('Ctrl+S on the list does not trigger any visible action', async ({ page }) => {
	await openMailbox(page);
	await page.keyboard.press('Control+S');
	await page.waitForTimeout(50);
	// No compose surface, no settings, no help — nothing claims Ctrl+S in list scope.
	await expect(page.getByTestId('compose.container')).toHaveCount(0);
	await expect(page.getByTestId('settings.panel')).not.toBeVisible();
	await expect(page.getByTestId('keyboard-help.dialog')).not.toBeVisible();
});

// openspec/changes/isolate-hotkeys/specs/ui-hotkeys/spec.md: j typed in compose body
test('j typed inside the compose body lands as the character "j"', async ({ page }) => {
	await openMailbox(page);
	await page.keyboard.press('c');
	const body = page.getByTestId('compose.body');
	await expect(body).toBeVisible();
	// Click to defeat the auto-focus on the To input — focus must land on the body
	// for the keystroke to type into it.
	await body.click();
	await expect(body).toBeFocused();
	await page.keyboard.type('j');
	await expect(body).toHaveValue('j');
});

// openspec/changes/isolate-hotkeys/specs/ui-hotkeys/spec.md: Exclusive scope swallows underlying view's keys
test('j with the settings modal open does not move list selection', async ({ page }) => {
	await openMailbox(page);
	const rows = page.getByTestId('mail-list.message-row');
	await rows.first().hover();
	const classBefore = (await rows.first().getAttribute('class')) ?? '';
	await page.keyboard.press('Control+,');
	await expect(page.getByTestId('settings.panel')).toBeVisible();
	await page.keyboard.press('j');
	await page.waitForTimeout(50);
	const classAfter = (await rows.first().getAttribute('class')) ?? '';
	expect(classAfter).toBe(classBefore);
});
