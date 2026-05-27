/** Reader-scope G / g g scroll bindings reach the actual scroll container. */
import { test, expect } from '../harness/fixtures.ts';
import { AccountsPage } from '../pages/AccountsPage.ts';
import { MailboxPage } from '../pages/MailboxPage.ts';
import { MessagePage } from '../pages/MessagePage.ts';
import { folderOf, manifest } from '../fixtures/manifest.ts';

const alice = manifest.find((a) => a.address === 'alice@example.com')!;
const inbox = folderOf(alice, 'Inbox');
const targetMsg = inbox.messages.find((m) => m.slug === 'alice-inbox-01-read-signed')!;

async function openMessage(page: import('@playwright/test').Page) {
	const accounts = new AccountsPage(page);
	await accounts.open();
	await accounts.select(alice.address);
	const mailbox = new MailboxPage(page);
	await mailbox.openFolder('Inbox');
	await mailbox.openMessage(targetMsg.subject);
	const reader = new MessagePage(page);
	await expect(reader.bodyLocator()).not.toBeEmpty();
	return reader;
}

/** Make the reader's scroll container actually overflow by injecting filler. */
async function makeReaderScrollable(page: import('@playwright/test').Page) {
	await page.locator('.mb-reader-scroll').evaluate((el) => {
		const filler = document.createElement('div');
		filler.style.cssText = 'height: 2000px;';
		filler.setAttribute('data-testid', 'reader-scroll-filler');
		el.appendChild(filler);
	});
}

function readerScrollTop(page: import('@playwright/test').Page): Promise<number> {
	return page.locator('.mb-reader-scroll').evaluate((el) => (el as HTMLElement).scrollTop);
}

// openspec/changes/isolate-hotkeys/specs/ui-hotkeys/spec.md: reader scope `G` scrolls body to bottom
test('G in the reader scrolls to the bottom of the body', async ({ page }) => {
	await openMessage(page);
	await makeReaderScrollable(page);
	expect(await readerScrollTop(page)).toBe(0);

	await page.keyboard.press('Shift+G');

	await expect
		.poll(() => readerScrollTop(page), { timeout: 2000 })
		.toBeGreaterThan(100);
});

// openspec/changes/isolate-hotkeys/specs/ui-hotkeys/spec.md: reader scope `g g` scrolls body to top
test('g g in the reader scrolls back to the top of the body', async ({ page }) => {
	await openMessage(page);
	await makeReaderScrollable(page);
	// Scroll partway down so the gg test has somewhere to return from.
	await page.locator('.mb-reader-scroll').evaluate((el) => {
		(el as HTMLElement).scrollTop = 400;
		el.dispatchEvent(new Event('scroll', { bubbles: true }));
	});
	expect(await readerScrollTop(page)).toBeGreaterThan(0);

	await page.keyboard.press('g');
	await page.keyboard.press('g');

	await expect
		.poll(() => readerScrollTop(page), { timeout: 2000 })
		.toBe(0);
});
