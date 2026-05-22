/** Task 7.6 / 8.2 — signature state rendering coverage. */
import { test, expect } from '../harness/fixtures.ts';
import { AccountsPage } from '../pages/AccountsPage.ts';
import { MailboxPage } from '../pages/MailboxPage.ts';
import { MessagePage } from '../pages/MessagePage.ts';
import { folderOf, manifest } from '../fixtures/manifest.ts';

const alice = manifest.find((a) => a.address === 'alice@example.com')!;
const inbox = folderOf(alice, 'Inbox');
const signedMsg = inbox.messages.find((m) => m.slug === 'alice-inbox-01-read-signed')!;
const unsignedMsg = inbox.messages.find((m) => m.slug === 'alice-inbox-02-unread-plain')!;
const brokenMsg = inbox.messages.find((m) => m.slug === 'alice-inbox-06-broken-sig')!;

async function openInbox(page: import('@playwright/test').Page): Promise<MailboxPage> {
	const accounts = new AccountsPage(page);
	await accounts.open();
	await accounts.select(alice.address);
	const mailbox = new MailboxPage(page);
	await mailbox.openFolder('Inbox');
	return mailbox;
}

test('a signed message is shown as signed', async ({ page }) => {
	expect(signedMsg.signature).toBe('signed'); // fixture sanity
	const mailbox = await openInbox(page);
	await mailbox.openMessage(signedMsg.subject);

	const reader = new MessagePage(page);
	await expect.poll(() => reader.signatureState()).toBe('signed');
});

test('an unsigned message shows no signature indication', async ({ page }) => {
	expect(unsignedMsg.signature).toBe('unsigned'); // fixture sanity
	const mailbox = await openInbox(page);
	await mailbox.openMessage(unsignedMsg.subject);

	const reader = new MessagePage(page);
	await expect(reader.bodyLocator()).not.toBeEmpty();
	await expect.poll(() => reader.signatureState()).toBe('unsigned');
});

/**
 * KNOWN UI GAP (task 8.2, deferred): the SPA only distinguishes signed vs
 * unsigned (presence of a `-- ` line; see `src/lib/utils.ts` -> splitSignature).
 * A tampered/broken signature renders identically to unsigned, so there is no
 * distinct "invalid" state to assert without a production code change. The
 * broken variant (alice-inbox-06) is committed to the corpus + manifest so this
 * test can be enabled once the UI gains a broken-signature state.
 */
test.fixme('a broken signature is shown as a distinct invalid state', async ({ page }) => {
	const mailbox = await openInbox(page);
	await mailbox.openMessage(brokenMsg.subject);

	const reader = new MessagePage(page);
	await expect.poll(() => reader.signatureState()).toBe('broken' as unknown as 'signed');
});
