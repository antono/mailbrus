/**
 * Keyboard actions inside the picker/palette surfaces (account picker, folder
 * picker, command palette).
 *
 * Regression: keymaps were stored in a deeply-reactive `$state` array, so each
 * registered keymap was wrapped in a proxy and `dispose()`'s identity lookup
 * never matched — keymaps leaked and accumulated. A stale picker keymap then
 * shadowed the live one (the dispatcher fires the first matching binding), so
 * e.g. Enter in the folder picker fired the unmounted account picker's confirm
 * and did nothing, while a mouse click — which calls the visible component's
 * handler directly — still worked. The registry now uses `$state.raw` so
 * disposal removes the right keymap.
 *
 * openspec/specs/ui-hotkeys/spec.md
 */
import { test, expect } from '../harness/fixtures.ts';
import { AccountsPage } from '../pages/AccountsPage.ts';
import { manifest } from '../fixtures/manifest.ts';

const alice = manifest.find((a) => a.address === 'alice@example.com')!;

test('Enter in the account picker selects the highlighted account', async ({ page }) => {
	const accounts = new AccountsPage(page);
	await accounts.open();
	await page.keyboard.press('Enter');
	// Selecting an account advances to the folder picker.
	await expect(page.getByText('Open a folder')).toBeVisible();
});

test('Enter in the folder picker opens the highlighted folder', async ({ page }) => {
	const accounts = new AccountsPage(page);
	await accounts.open();
	await accounts.select(alice.address);
	await expect(page.getByText('Open a folder')).toBeVisible();

	await page.keyboard.press('Enter');
	await expect(page.getByTestId('mail-list.container')).toBeVisible();
});

test('Enter opens a folder in the folder picker reopened from the toolbar', async ({ page }) => {
	const accounts = new AccountsPage(page);
	await accounts.open();
	await accounts.select(alice.address);
	const mailbox = new (await import('../pages/MailboxPage.ts')).MailboxPage(page);
	await mailbox.openFolder('Inbox');

	// Reopen the folder picker via the breadcrumb (top toolbar). Unlike the
	// start-screen flow, the message list stays mounted underneath; a register
	// (folder picker keymap) and a dispose (list keymap) then run in the same
	// reactive flush, which used to drop the freshly registered picker keymap so
	// Enter was ignored (mouse click still worked).
	await page.getByTestId('breadcrumbs.folder-btn').click();
	await expect(page.getByTestId('folders.curtain')).toBeVisible();

	await page.keyboard.press('Enter');
	await expect(page.getByTestId('folders.curtain')).toHaveCount(0);
	await expect(page.getByTestId('mail-list.container')).toBeVisible();
});

test('Escape closes the command palette', async ({ page }) => {
	const accounts = new AccountsPage(page);
	await accounts.open();
	await accounts.select(alice.address);
	const mailbox = new (await import('../pages/MailboxPage.ts')).MailboxPage(page);
	await mailbox.openFolder('Inbox');

	await page.keyboard.press('Control+K');
	await expect(page.getByTestId('commands.curtain')).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(page.getByTestId('commands.curtain')).toHaveCount(0);
});
