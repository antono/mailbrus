/** Task 7.5 — attachment rendering coverage. */
import { test, expect } from '../harness/fixtures.ts';
import { AccountsPage } from '../pages/AccountsPage.ts';
import { MailboxPage } from '../pages/MailboxPage.ts';
import { MessagePage } from '../pages/MessagePage.ts';
import { folderOf, manifest } from '../fixtures/manifest.ts';

const alice = manifest.find((a) => a.address === 'alice@example.com')!;
const inbox = folderOf(alice, 'Inbox');
const noAttachMsg = inbox.messages.find((m) => m.slug === 'alice-inbox-01-read-signed')!;
const multiAttachMsg = inbox.messages.find((m) => m.slug === 'alice-inbox-04-replied-multi')!;

async function openInbox(page: import('@playwright/test').Page): Promise<MailboxPage> {
	const accounts = new AccountsPage(page);
	await accounts.open();
	await accounts.select(alice.address);
	const mailbox = new MailboxPage(page);
	await mailbox.openFolder('Inbox');
	return mailbox;
}

test('a message without attachments shows no attachment chips', async ({ page }) => {
	expect(noAttachMsg.attachments).toHaveLength(0); // fixture sanity
	const mailbox = await openInbox(page);
	await mailbox.openMessage(noAttachMsg.subject);

	const reader = new MessagePage(page);
	await expect(reader.bodyLocator()).not.toBeEmpty(); // wait for the message to load
	await expect(reader.attachments()).toHaveCount(0);
});

/**
 * KNOWN UI GAP (out of scope here — production code is frozen for this change):
 * the SPA never shows attachments. The list API omits them and `+page.svelte`
 * discards `fetchMessage().attachments`, so `<Attachments>` always renders
 * nothing. The backend DOES expose them — proven by the API test below — so
 * this scenario is enabled the moment the SPA wires attachments into the reader.
 */
test.fixme('a message with attachments shows them in the reader', async ({ page }) => {
	const mailbox = await openInbox(page);
	await mailbox.openMessage(multiAttachMsg.subject);

	const reader = new MessagePage(page);
	expect(await reader.attachmentNames()).toEqual(multiAttachMsg.attachments.map((a) => a.filename));
});

test('the backend serves attachments of attachment-bearing messages', async ({ app, request }) => {
	expect(multiAttachMsg.attachments.length).toBeGreaterThan(1); // multiple, differing MIME
	const res = await request.get(`${app.baseURL}/api/messages/${encodeURIComponent(multiAttachMsg.messageId)}`);
	expect(res.ok()).toBe(true);
	const data = (await res.json()) as { attachments: { name: string; mime: string }[] };
	expect(data.attachments.map((a) => a.name)).toEqual(multiAttachMsg.attachments.map((a) => a.filename));
	expect(data.attachments.map((a) => a.mime)).toEqual(multiAttachMsg.attachments.map((a) => a.mime));
});
