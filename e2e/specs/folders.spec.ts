/** Task 7.2 — folder navigation: account -> folders, folder -> messages. */
import { test, expect } from '../harness/fixtures.ts';
import { AccountsPage } from '../pages/AccountsPage.ts';
import { MailboxPage } from '../pages/MailboxPage.ts';
import { folderOf, manifest } from '../fixtures/manifest.ts';

const alice = manifest.find((a) => a.address === 'alice@example.com')!;

test('selecting an account shows its folders', async ({ page }) => {
	const accounts = new AccountsPage(page);
	await accounts.open();
	await accounts.select(alice.address);

	const mailbox = new MailboxPage(page);
	const listed = await mailbox.listedFolders();
	for (const folder of alice.folders) {
		expect(listed).toContain(folder.name);
	}
});

test('selecting a folder lists the messages the manifest places there', async ({ page }) => {
	const accounts = new AccountsPage(page);
	await accounts.open();
	await accounts.select(alice.address);

	const mailbox = new MailboxPage(page);
	await mailbox.openFolder('Inbox');

	const inbox = folderOf(alice, 'Inbox');
	await expect.poll(() => mailbox.subjects()).toHaveLength(inbox.messages.length);
	const subjects = await mailbox.subjects();
	for (const m of inbox.messages) {
		expect(subjects).toContain(m.subject);
	}
});
