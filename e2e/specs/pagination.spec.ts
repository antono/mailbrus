/** Task 7.3 — pagination: page navigation + "X / Y" indicator + flash animation. */
import { test, expect } from '../harness/fixtures.ts';
import { AccountsPage } from '../pages/AccountsPage.ts';
import { MailboxPage } from '../pages/MailboxPage.ts';
import { folderOf, manifest, messagesNewestFirst, PER_PAGE } from '../fixtures/manifest.ts';

const alice = manifest.find((a) => a.address === 'alice@example.com')!;

// openspec/specs/message-pagination-ui/spec.md: pagination navigation + X/Y format
test('navigates pages and shows "X / Y" indicators', async ({ page }) => {
	const archive = folderOf(alice, 'Archive');
	const count = archive.messages.length;
	expect(count, 'Archive must exceed one page for this test').toBeGreaterThan(PER_PAGE);
	const lastPage = Math.ceil(count / PER_PAGE);

	const ordered = messagesNewestFirst(archive); // server sorts newest-first
	const expectedPage1 = ordered.slice(0, PER_PAGE).map((m) => m.subject);
	const expectedPage2 = ordered.slice(PER_PAGE).map((m) => m.subject);

	const accounts = new AccountsPage(page);
	await accounts.open();
	await accounts.select(alice.address);

	const mailbox = new MailboxPage(page);
	await mailbox.openFolder('Archive');

	// Page 1
	await expect(mailbox.paginationInfo()).toHaveText(`1 / ${lastPage}`);
	await expect.poll(() => mailbox.subjects()).toEqual(expectedPage1);

	// Page 2
	await mailbox.nextPage();
	await expect(mailbox.paginationInfo()).toHaveText(`2 / ${lastPage}`);
	await expect.poll(() => mailbox.subjects()).toEqual(expectedPage2);
});

// openspec/specs/message-pagination-ui/spec.md: pg-counter pulse animation
test('breadcrumb page counter has pg-counter (flash animation) class', async ({ page }) => {
	const accounts = new AccountsPage(page);
	await accounts.open();
	await accounts.select(alice.address);

	const mailbox = new MailboxPage(page);
	await mailbox.openFolder('Archive');

	// {#key page} re-mounts the span on page change, retriggering the CSS animation.
	const counter = mailbox.paginationInfo();
	await expect(counter).toHaveClass(/pg-counter/);

	await mailbox.nextPage();
	// After navigation the re-mounted counter still carries the class.
	await expect(mailbox.paginationInfo()).toHaveClass(/pg-counter/);
});
