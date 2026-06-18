/**
 * Opening a message with the Enter key keeps working across the reader
 * lifecycle — including after another scope (the command palette) has layered
 * over the reader and been dismissed.
 *
 * Regression: scoped views (reader, palette, modals) used a `$effect` that read
 * their inline-arrow handler props, so the effect re-ran on every parent render
 * and executed popScope + pushScope each time. While a scope was layered above
 * the reader, that pop+push reordered the scope stack, leaving `activeScope()`
 * out of sync with the visible surface. Because keyboard bindings are
 * scope-gated, Enter (and j/k/etc.) silently stopped firing on the list while
 * mouse clicks — which are not scope-gated — kept working. The fix binds each
 * scope+keymap once per mount via `useScopedKeymap`.
 *
 * openspec/specs/ui-hotkeys/spec.md
 */
import { test, expect } from '../harness/fixtures.ts';
import { AccountsPage } from '../pages/AccountsPage.ts';
import { MailboxPage } from '../pages/MailboxPage.ts';
import { manifest } from '../fixtures/manifest.ts';

const alice = manifest.find((a) => a.address === 'alice@example.com')!;

async function openMailbox(page: import('@playwright/test').Page) {
	const accounts = new AccountsPage(page);
	await accounts.open();
	await accounts.select(alice.address);
	const mailbox = new MailboxPage(page);
	await mailbox.openFolder('Inbox');
	return mailbox;
}

/** Hover the first row (sets the list's selectedIdx) and press Enter. */
async function pressEnterOnFirstRow(page: import('@playwright/test').Page) {
	await page.getByTestId('mail-list.message-row').first().hover();
	await page.keyboard.press('Enter');
}

test('Enter opens the selected message, and keeps working after closing it', async ({ page }) => {
	await openMailbox(page);

	await pressEnterOnFirstRow(page);
	await expect(page.getByTestId('reader.container')).toBeVisible();

	await page.keyboard.press('Escape');
	await expect(page.getByTestId('reader.container')).toHaveCount(0);
	await expect(page.getByTestId('mail-list.container')).toBeVisible();

	// Enter must still open the reader a second time — the scope returned to list.
	await pressEnterOnFirstRow(page);
	await expect(page.getByTestId('reader.container')).toBeVisible();
});

test('Enter still opens a message after a modal was layered over the reader', async ({ page }) => {
	await openMailbox(page);

	// Open the reader with the keyboard.
	await pressEnterOnFirstRow(page);
	await expect(page.getByTestId('reader.container')).toBeVisible();

	// Layer the keyboard-help modal over the reader. The help dialog reports the
	// scope beneath it, which must still be the reader (stack: list, reader,
	// modal) — proving the reader scope did not float above the modal.
	await page.keyboard.press('?');
	await expect(page.getByTestId('keyboard-help.dialog')).toBeVisible();
	await expect(page.getByTestId('keyboard-help.scope-title')).toHaveText('Reader');

	// Dismiss the modal, then the reader, back to the list.
	await page.keyboard.press('Escape');
	await expect(page.getByTestId('keyboard-help.dialog')).toHaveCount(0);
	await expect(page.getByTestId('reader.container')).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(page.getByTestId('reader.container')).toHaveCount(0);
	await expect(page.getByTestId('mail-list.container')).toBeVisible();

	// The list scope is active again: Enter opens the reader. (With the scope
	// churn bug the stack was left corrupted and this Enter did nothing.)
	await pressEnterOnFirstRow(page);
	await expect(page.getByTestId('reader.container')).toBeVisible();
});
