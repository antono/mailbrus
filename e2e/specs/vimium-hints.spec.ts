/** Vimium-style f-key hint mode (list + reader). */
import { test, expect } from '../harness/fixtures.ts';
import { AccountsPage } from '../pages/AccountsPage.ts';
import { MailboxPage } from '../pages/MailboxPage.ts';
import { MessagePage } from '../pages/MessagePage.ts';
import { folderOf, manifest } from '../fixtures/manifest.ts';

const alice = manifest.find((a) => a.address === 'alice@example.com')!;
const inbox = folderOf(alice, 'Inbox');
const multipartMsg = inbox.messages.find((m) => m.slug === 'alice-inbox-08-multipart-alt')!;

// openspec/specs/vimium-link-hints/spec.md: f activates hints on list; letter opens message
test('list mode: f shows hint badges and pressing the letter opens that message', async ({ page }) => {
	const accounts = new AccountsPage(page);
	await accounts.open();
	await accounts.select(alice.address);

	const mailbox = new MailboxPage(page);
	await mailbox.openFolder('Inbox');

	// Capture subjects in display order so we can compare against the row the
	// first badge (label "a") sits on.
	const subjectsBefore = await mailbox.subjects();
	expect(subjectsBefore.length).toBeGreaterThanOrEqual(3);

	// Activate hint mode.
	await page.keyboard.press('f');
	const overlay = page.getByTestId('hint-overlay');
	await expect(overlay).toBeVisible();
	const badges = page.getByTestId('hint-badge');
	const badgeCount = await badges.count();
	expect(badgeCount).toBeGreaterThanOrEqual(3);

	// First badge always labeled "a" — pressing it opens the first row.
	await expect(badges.first()).toHaveText('a');
	await page.keyboard.press('a');

	// Overlay dismisses + reader opens for the first message.
	await expect(overlay).not.toBeVisible();
	await expect(page.getByTestId('reader.container')).toBeVisible();
	const reader = new MessagePage(page);
	await expect(reader.subjectLocator()).toContainText(subjectsBefore[0]);
});

// openspec/specs/vimium-link-hints/spec.md: Escape cancels link hints in reader
test('reader mode: f shows link badges, Escape cancels and reader stays open', async ({ page }) => {
	const accounts = new AccountsPage(page);
	await accounts.open();
	await accounts.select(alice.address);

	const mailbox = new MailboxPage(page);
	await mailbox.openFolder('Inbox');
	await mailbox.openMessage(multipartMsg.subject);

	// Wait for body to populate with linkified anchors (proxy for non-html mode).
	const firstLink = page.locator('a.mb-link').first();
	await expect(firstLink).toBeVisible();

	await page.keyboard.press('f');
	const overlay = page.getByTestId('hint-overlay');
	await expect(overlay).toBeVisible();
	await expect(page.getByTestId('hint-badge').first()).toBeVisible();

	// Escape inside hint mode dismisses badges but does NOT close the reader.
	await page.keyboard.press('Escape');
	await expect(overlay).not.toBeVisible();
	await expect(page.getByTestId('reader.container')).toBeVisible();
});
