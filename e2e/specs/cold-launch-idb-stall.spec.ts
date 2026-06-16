/**
 * Regression: the message list must load from the network even when IndexedDB
 * is unavailable. On a first launch the cache read (`getLocalMessages`) could
 * stall — e.g. a service-worker holding a pending versionchange, a blocked
 * `indexedDB.open`, or a slow disk — and the old code awaited that read BEFORE
 * issuing the `/api/messages` fetch. The list then stuck on "loading…" with no
 * messages until a manual reload. The fetch must never be gated on the cache.
 */
import { test, expect } from '../harness/fixtures.ts';
import { AccountsPage } from '../pages/AccountsPage.ts';
import { MailboxPage } from '../pages/MailboxPage.ts';
import { folderOf, messagesNewestFirst, manifest, PER_PAGE } from '../fixtures/manifest.ts';

const alice = manifest.find((a) => a.address === 'alice@example.com')!;
const inbox = folderOf(alice, 'Inbox');
const newestSubject = messagesNewestFirst(inbox)[0].subject;
const expectedRows = Math.min(PER_PAGE, inbox.messages.length);

/** Make every IndexedDB open hang forever, before any app code runs. */
async function stallIndexedDB(page: import('@playwright/test').Page): Promise<void> {
	await page.addInitScript(() => {
		// Return a request-like object whose events never fire — mimics a blocked
		// / permanently-stalled open. `openDB()` would await this indefinitely.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(indexedDB as any).open = () => ({
			onsuccess: null,
			onerror: null,
			onupgradeneeded: null,
			onblocked: null,
			result: null,
			readyState: 'pending'
		});
	});
}

// openspec/specs/frontend-data-layer/spec.md: message list loads from network independent of IDB cache
test('first-time folder open renders the list even when IndexedDB stalls', async ({ page }) => {
	await stallIndexedDB(page);

	const accounts = new AccountsPage(page);
	await accounts.open();
	await accounts.select(alice.address);

	const mailbox = new MailboxPage(page);
	await mailbox.openFolder('Inbox');

	// The regression symptom was an empty list stuck on "loading…". The fetch
	// must populate the list regardless of the stalled cache read.
	await expect(page.getByTestId('mail-list.message-row')).toHaveCount(expectedRows);
	await expect(page.getByTestId('mail-list.message-row').first()).toContainText(newestSubject);
	await expect(page.getByText('loading…')).toHaveCount(0);
});
