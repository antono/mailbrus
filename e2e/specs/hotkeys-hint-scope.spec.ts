/** Hint scope layers over reader and consumes navigation keys until cancelled. */
import { test, expect } from '../harness/fixtures.ts';
import { AccountsPage } from '../pages/AccountsPage.ts';
import { MailboxPage } from '../pages/MailboxPage.ts';
import { MessagePage } from '../pages/MessagePage.ts';
import { folderOf, manifest } from '../fixtures/manifest.ts';

const alice = manifest.find((a) => a.address === 'alice@example.com')!;
const inbox = folderOf(alice, 'Inbox');
// Multipart message has real linkified anchors in the body for `f` to hit.
const multipartMsg = inbox.messages.find((m) => m.slug === 'alice-inbox-08-multipart-alt')!;

async function openReader(page: import('@playwright/test').Page) {
	const accounts = new AccountsPage(page);
	await accounts.open();
	await accounts.select(alice.address);
	const mailbox = new MailboxPage(page);
	await mailbox.openFolder('Inbox');
	await mailbox.openMessage(multipartMsg.subject);
	const reader = new MessagePage(page);
	await expect(reader.bodyLocator()).not.toBeEmpty();
	// Wait for the first .mb-link to render so `f` has at least one target.
	await expect(page.locator('a.mb-link').first()).toBeVisible();
	return reader;
}

// openspec/changes/isolate-hotkeys/specs/ui-hotkeys/spec.md: Hint mode layers over its host scope
test('f in the reader activates hint mode without closing the reader', async ({ page }) => {
	await openReader(page);
	await page.keyboard.press('f');
	await expect(page.getByTestId('hint-overlay')).toBeVisible();
	await expect(page.getByTestId('reader.container')).toBeVisible();
});

// openspec/changes/isolate-hotkeys/specs/ui-hotkeys/spec.md: Exclusive scope swallows underlying view's keys
test('j while hint mode is active does not navigate to the next message', async ({ page }) => {
	const reader = await openReader(page);
	const subjectBefore = await reader.subjectLocator().textContent();
	await page.keyboard.press('f');
	await expect(page.getByTestId('hint-overlay')).toBeVisible();
	await page.keyboard.press('j');
	// `j` should be consumed by the hint scope (cancels via fallback). It must NOT call
	// the reader's "next message" binding.
	await page.waitForTimeout(100);
	await expect(reader.subjectLocator()).toHaveText(subjectBefore ?? '');
});

// openspec/changes/isolate-hotkeys/specs/ui-hotkeys/spec.md: Hint Escape cancels hint mode only
test('Escape during hint mode cancels hints but leaves the reader open', async ({ page }) => {
	await openReader(page);
	await page.keyboard.press('f');
	const overlay = page.getByTestId('hint-overlay');
	await expect(overlay).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(overlay).not.toBeVisible();
	await expect(page.getByTestId('reader.container')).toBeVisible();
});
