/**
 * Reader cross-page navigation, the `q` quit-to-list hotkey, and the
 * `[ index / page / total ]` position counter. Uses the Archive folder (27
 * messages > PER_PAGE of 25) so reader navigation crosses a page boundary.
 */
import { test, expect } from '../harness/fixtures.ts';
import { AccountsPage } from '../pages/AccountsPage.ts';
import { MailboxPage } from '../pages/MailboxPage.ts';
import { MessagePage } from '../pages/MessagePage.ts';
import { folderOf, messagesNewestFirst, manifest, PER_PAGE } from '../fixtures/manifest.ts';

const alice = manifest.find((a) => a.address === 'alice@example.com')!;
const archive = folderOf(alice, 'Archive');
const ordered = messagesNewestFirst(archive); // newest-first, matches server sort
const total = archive.messages.length; // 27
const lastPage = Math.ceil(total / PER_PAGE); // 2

const lastOnPage1 = ordered[PER_PAGE - 1]; // index 25 absolute, last row of page 1
const firstOnPage2 = ordered[PER_PAGE]; // index 26 absolute, first row of page 2
const lastInFolder = ordered[total - 1]; // index 27 absolute, last message overall

async function openArchive(page: import('@playwright/test').Page): Promise<MailboxPage> {
	const accounts = new AccountsPage(page);
	await accounts.open();
	await accounts.select(alice.address);
	const mailbox = new MailboxPage(page);
	await mailbox.openFolder('Archive');
	return mailbox;
}

// openspec/changes/reader-cross-page-nav/specs/ui-hotkeys/spec.md: next crosses to following page
test('reader j at the last message of a page opens the next page', async ({ page }) => {
	const mailbox = await openArchive(page);
	await mailbox.openMessage(lastOnPage1.subject);
	const reader = new MessagePage(page);

	await reader.next();

	await expect(reader.subjectLocator()).toContainText(firstOnPage2.subject);
	await expect(reader.counterPage()).toHaveText(String(lastPage));
	await expect(reader.counterIndex()).toHaveText(String(PER_PAGE + 1));
});

// openspec/changes/reader-cross-page-nav/specs/ui-hotkeys/spec.md: previous crosses to preceding page
test('reader k at the first message of a page opens the previous page', async ({ page }) => {
	const mailbox = await openArchive(page);
	await mailbox.openMessage(lastOnPage1.subject);
	const reader = new MessagePage(page);

	await reader.next(); // cross into page 2 (first message)
	await expect(reader.counterPage()).toHaveText(String(lastPage));

	await reader.prev(); // cross back to page 1 (last message)
	await expect(reader.subjectLocator()).toContainText(lastOnPage1.subject);
	await expect(reader.counterPage()).toHaveText('1');
	await expect(reader.counterIndex()).toHaveText(String(PER_PAGE));
});

// openspec/changes/reader-cross-page-nav/specs/ui-hotkeys/spec.md: next at last message is a no-op
test('reader j at the last message of the folder does nothing', async ({ page }) => {
	const mailbox = await openArchive(page);
	await mailbox.openMessage(lastOnPage1.subject);
	const reader = new MessagePage(page);

	await reader.next(); // page 2, first message
	await reader.next(); // page 2, second (= last in folder)
	await expect(reader.counterIndex()).toHaveText(String(total));

	await reader.next(); // no-op at the absolute end
	await expect(reader.subjectLocator()).toContainText(lastInFolder.subject);
	await expect(reader.counterIndex()).toHaveText(String(total));
});

// openspec/changes/reader-cross-page-nav/specs/ui-hotkeys/spec.md: q returns to the list focused on the current message
test('q returns to the list on the page containing the current message', async ({ page }) => {
	const mailbox = await openArchive(page);
	await mailbox.openMessage(lastOnPage1.subject);
	const reader = new MessagePage(page);

	await reader.next(); // cross into page 2
	await expect(reader.counterPage()).toHaveText(String(lastPage));

	await reader.quit();

	await expect(page.getByTestId('reader.container')).not.toBeVisible();
	await expect(mailbox.paginationInfo()).toHaveText(`${lastPage} / ${lastPage}`);
	await expect(mailbox.messageRow(firstOnPage2.subject).first()).toHaveClass(/active/);
});

// openspec/changes/reader-cross-page-nav/specs/sveltekit-ui/spec.md: position counter shows index/page/total with hints
test('reader counter shows absolute index, page, total with hover hints', async ({ page }) => {
	const mailbox = await openArchive(page);
	await mailbox.openMessage(ordered[0].subject); // first message of the folder
	const reader = new MessagePage(page);

	await expect(reader.counterIndex()).toHaveText('1');
	await expect(reader.counterPage()).toHaveText('1');
	await expect(reader.counterTotal()).toHaveText(String(total));

	await expect(reader.counterIndex()).toHaveAttribute('title', `Message 1 of ${total}`);
	await expect(reader.counterPage()).toHaveAttribute('title', `Page 1 of ${lastPage}`);
	await expect(reader.counterTotal()).toHaveAttribute('title', `${total} messages in ${archive.name}`);
});
