/** Task 7.4 — reading: headers/body render; unread becomes read in the UI. */
import { test, expect } from '../harness/fixtures.ts';
import { AccountsPage } from '../pages/AccountsPage.ts';
import { MailboxPage } from '../pages/MailboxPage.ts';
import { MessagePage } from '../pages/MessagePage.ts';
import { folderOf, isUnread, manifest } from '../fixtures/manifest.ts';

const alice = manifest.find((a) => a.address === 'alice@example.com')!;
const inbox = folderOf(alice, 'Inbox');
const readMsg = inbox.messages.find((m) => m.slug === 'alice-inbox-01-read-signed')!;
const unreadMsg = inbox.messages.find((m) => m.slug === 'alice-inbox-02-unread-plain')!;

async function openInbox(page: import('@playwright/test').Page): Promise<MailboxPage> {
	const accounts = new AccountsPage(page);
	await accounts.open();
	await accounts.select(alice.address);
	const mailbox = new MailboxPage(page);
	await mailbox.openFolder('Inbox');
	return mailbox;
}

// openspec/specs/message-read/spec.md: message rendering
test('opening a message renders its subject, sender, and body', async ({ page }) => {
	const mailbox = await openInbox(page);
	await mailbox.openMessage(readMsg.subject);

	const reader = new MessagePage(page);
	await expect(reader.subjectLocator()).toContainText(readMsg.subject);
	await expect(reader.metaLocator()).toContainText(readMsg.from); // display name
	await expect(reader.metaLocator()).toContainText(readMsg.fromAddr);
	await expect(reader.bodyLocator()).toContainText('roadmap section');
});

// openspec/specs/sveltekit-ui/spec.md: unread state management
test('an unread message becomes read in the UI', async ({ page }) => {
	const mailbox = await openInbox(page);
	expect(isUnread(unreadMsg), 'fixture sanity: in-02 is unread').toBe(true);

	await expect.poll(() => mailbox.isUnread(unreadMsg.subject)).toBe(true);
	await mailbox.markRead(unreadMsg.subject);
	await expect.poll(() => mailbox.isUnread(unreadMsg.subject)).toBe(false);
});
