/** Keyboard help shows Global + the active scope's keymap, never a union. */
import { test, expect } from '../harness/fixtures.ts';
import { AccountsPage } from '../pages/AccountsPage.ts';
import { MailboxPage } from '../pages/MailboxPage.ts';
import { folderOf, manifest } from '../fixtures/manifest.ts';

const alice = manifest.find((a) => a.address === 'alice@example.com')!;
const inbox = folderOf(alice, 'Inbox');
const firstMessage = inbox.messages[0];

async function openMailbox(page: import('@playwright/test').Page) {
	const accounts = new AccountsPage(page);
	await accounts.open();
	await accounts.select(alice.address);
	const mailbox = new MailboxPage(page);
	await mailbox.openFolder('Inbox');
	return mailbox;
}

// openspec/changes/isolate-hotkeys/specs/ui-hotkeys/spec.md: Open help from list — Global + List only
test('? on the list shows the Global and List sections only', async ({ page }) => {
	await openMailbox(page);
	await page.keyboard.press('?');
	const help = page.getByTestId('keyboard-help.dialog');
	await expect(help).toBeVisible();
	await expect(page.getByTestId('keyboard-help.scope-title')).toHaveText('List');
	const globalSect = page.getByTestId('keyboard-help.section-global');
	await expect(globalSect).toBeVisible();
	await expect(globalSect).toContainText('Toggle keyboard help');
	await expect(globalSect).toContainText('Command palette');
	// List-scope hallmarks present.
	const scopeSects = page.getByTestId('keyboard-help.section-scope');
	const scopeText = (await scopeSects.allTextContents()).join('\n');
	expect(scopeText).toContain('Next message');
	expect(scopeText).toContain('Search this folder');
	expect(scopeText).toContain('Compose new message');
});

// openspec/changes/isolate-hotkeys/specs/ui-hotkeys/spec.md: Open help from reader — no list-only entries
test('? in the reader shows the Reader section, not the List section', async ({ page }) => {
	const mailbox = await openMailbox(page);
	await mailbox.openMessage(firstMessage.subject);
	await page.keyboard.press('?');
	const help = page.getByTestId('keyboard-help.dialog');
	await expect(help).toBeVisible();
	await expect(page.getByTestId('keyboard-help.scope-title')).toHaveText('Reader');
	const scopeSects = page.getByTestId('keyboard-help.section-scope');
	const scopeText = (await scopeSects.allTextContents()).join('\n');
	expect(scopeText).toContain('Scroll down');
	expect(scopeText).toContain('Follow link / attachment by hint');
	// List-scope bindings absent.
	expect(scopeText).not.toContain('Search this folder');
	expect(scopeText).not.toContain('Compose new message');
	expect(scopeText).not.toContain('Inbox');
});

// openspec/changes/isolate-hotkeys/specs/ui-hotkeys/spec.md: Open help from compose — Compose only
test('? in compose (outside the body input) shows the Compose section', async ({ page }) => {
	await openMailbox(page);
	await page.keyboard.press('c');
	await expect(page.getByTestId('compose.container')).toBeVisible();
	// Move focus out of the auto-focused To input so the global typing guard does not skip `?`.
	await page.getByTestId('compose.container').click({ position: { x: 1, y: 1 } });
	await page.keyboard.press('?');
	const help = page.getByTestId('keyboard-help.dialog');
	await expect(help).toBeVisible();
	await expect(page.getByTestId('keyboard-help.scope-title')).toHaveText('Compose');
	const scopeText = (await page.getByTestId('keyboard-help.section-scope').allTextContents()).join('\n');
	expect(scopeText).toContain('Send');
	expect(scopeText).toContain('Save draft');
	expect(scopeText).not.toContain('Search this folder');
});

// openspec/changes/isolate-hotkeys/specs/ui-hotkeys/spec.md: ? suppressed in text inputs
test('? typed in a focused input does not open help', async ({ page }) => {
	const mailbox = await openMailbox(page);
	await page.keyboard.press('/');
	await expect(page.getByTestId('mail-list.search-input')).toBeFocused();
	await page.keyboard.press('?');
	await expect(page.getByTestId('keyboard-help.dialog')).not.toBeVisible();
	await expect(page.getByTestId('mail-list.search-input')).toHaveValue('?');
});
