/** Task 7.3 — pagination: page navigation + page/per-page/count indicators. */
import { test, expect } from '../harness/fixtures.ts';
import { AccountsPage } from '../pages/AccountsPage.ts';
import { MailboxPage } from '../pages/MailboxPage.ts';
import { folderOf, manifest, messagesNewestFirst, PER_PAGE } from '../fixtures/manifest.ts';

const alice = manifest.find((a) => a.address === 'alice@example.com')!;

test('navigates pages and shows correct indicators', async ({ page }) => {
	const archive = folderOf(alice, 'Archive');
	const count = archive.messages.length;
	expect(count, 'Archive must exceed one page for this test').toBeGreaterThan(PER_PAGE);

	const ordered = messagesNewestFirst(archive); // server sorts newest-first
	const expectedPage1 = ordered.slice(0, PER_PAGE).map((m) => m.subject);
	const expectedPage2 = ordered.slice(PER_PAGE).map((m) => m.subject);

	const accounts = new AccountsPage(page);
	await accounts.open();
	await accounts.select(alice.address);

	const mailbox = new MailboxPage(page);
	await mailbox.openFolder('Archive');

	// Page 1
	await expect(mailbox.paginationInfo()).toHaveText(`page 1: 1–${PER_PAGE} of ${count}`);
	await expect.poll(() => mailbox.subjects()).toEqual(expectedPage1);

	// Page 2
	await mailbox.nextPage();
	await expect(mailbox.paginationInfo()).toHaveText(`page 2: ${PER_PAGE + 1}–${count} of ${count}`);
	await expect.poll(() => mailbox.subjects()).toEqual(expectedPage2);
});
