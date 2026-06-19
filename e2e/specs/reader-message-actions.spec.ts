/** Reader message actions: reply / reply-all / forward / yank / headers menu. */
import { test, expect } from '../harness/fixtures.ts';
import { AccountsPage } from '../pages/AccountsPage.ts';
import { MailboxPage } from '../pages/MailboxPage.ts';
import { MessagePage } from '../pages/MessagePage.ts';
import { ComposePage } from '../pages/ComposePage.ts';
import { folderOf, manifest } from '../fixtures/manifest.ts';

const alice = manifest.find((a) => a.address === 'alice@example.com')!;
const inbox = folderOf(alice, 'Inbox');
// Multiple recipients incl. alice — drives reply / reply-all / forward / yank.
const multi = inbox.messages.find((m) => m.slug === 'alice-inbox-10-multi-recipient')!;
// Has a URL in its plain-text body — drives the `f` hint-mode coexistence check.
const linky = inbox.messages.find((m) => m.slug === 'alice-inbox-08-multipart-alt')!;
const firstBodyLine = multi.bodyText.split('\n')[0];

// Clipboard for the yank specs (assert via navigator.clipboard.readText()).
test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

async function openMessage(
	page: import('@playwright/test').Page,
	subject: string
): Promise<MessagePage> {
	const accounts = new AccountsPage(page);
	await accounts.open();
	await accounts.select(alice.address);
	const mailbox = new MailboxPage(page);
	await mailbox.openFolder('Inbox');
	await mailbox.openMessage(subject);
	const reader = new MessagePage(page);
	// Body loads on a separate tick; reply/yank need it populated.
	await expect(reader.bodyLocator()).not.toBeEmpty();
	return reader;
}

// openspec/specs/reader-message-actions/spec.md: r opens compose addressed to sender, Re: subject, quoted body
test('r replies to sender with Re: subject and quoted body', async ({ page }) => {
	const reader = await openMessage(page, multi.subject);
	await reader.reply();

	const compose = new ComposePage(page);
	await compose.waitVisible();
	expect(await compose.toValue()).toContain(multi.fromAddr);
	expect(await compose.subjectValue()).toBe(`Re: ${multi.subject}`);
	expect(await compose.bodyValue()).toContain(`> ${firstBodyLine}`);
});

// openspec/specs/reader-message-actions/spec.md: R populates To/Cc from participants, excludes own address
test('R replies to all, Cc from participants, excluding the active account', async ({ page }) => {
	const reader = await openMessage(page, multi.subject);
	await reader.replyAll();

	const compose = new ComposePage(page);
	await compose.waitVisible();
	expect(await compose.toValue()).toContain(multi.fromAddr);
	const cc = await compose.ccValue();
	expect(cc).toContain('bob@work.example');
	expect(cc).toContain('carol@work.example');
	// alice@example.com was a recipient but is the active account — excluded.
	expect(cc).not.toContain(alice.address);
});

// openspec/specs/reader-message-actions/spec.md: F forwards with empty To, Fwd: subject, headers + body
test('F forwards with empty To, Fwd: subject, and forwarded headers + body', async ({ page }) => {
	const reader = await openMessage(page, multi.subject);
	await reader.forward();

	const compose = new ComposePage(page);
	await compose.waitVisible();
	expect(await compose.toValue()).toBe('');
	expect(await compose.subjectValue()).toBe(`Fwd: ${multi.subject}`);
	const body = await compose.bodyValue();
	expect(body).toContain('From:');
	expect(body).toContain('Subject:');
	expect(body).toContain(firstBodyLine);
});

// openspec/specs/reader-message-actions/spec.md: f still activates hint mode (distinct from F)
test('f still activates hint mode and does not forward', async ({ page }) => {
	const reader = await openMessage(page, linky.subject);
	await reader.activateHints();
	await expect(page.getByTestId('hint-overlay')).toBeVisible();
	// Hint mode, not forward — compose did not open.
	await expect(page.getByTestId('compose.container')).toHaveCount(0);
});

// openspec/specs/reader-message-actions/spec.md: y copies body only; Y copies headers + body
test('y copies the body only; Y copies headers and body', async ({ page }) => {
	const reader = await openMessage(page, multi.subject);

	await reader.yankBody();
	await expect(reader.yankToast()).toHaveText('Message text copied to clipboard');
	const bodyOnly = await page.evaluate(() => navigator.clipboard.readText());
	expect(bodyOnly).toContain(firstBodyLine);
	expect(bodyOnly).not.toContain('From:');

	await reader.yankHeaders();
	await expect(reader.yankToast()).toHaveText('Message text with headers copied to clipboard');
	const withHeaders = await page.evaluate(() => navigator.clipboard.readText());
	expect(withHeaders).toContain('From:');
	expect(withHeaders).toContain('To:');
	expect(withHeaders).toContain('Subject:');
	expect(withHeaders).toContain(firstBodyLine);
});

// openspec/specs/reader-message-actions/spec.md: yank toast auto-dismisses
test('the yank toast appears then auto-dismisses', async ({ page }) => {
	const reader = await openMessage(page, multi.subject);
	await reader.yankBody();
	await expect(reader.yankToast()).toBeVisible();
	await expect(reader.yankToast()).toHaveCount(0, { timeout: 4000 });
});

// openspec/specs/reader-message-actions/spec.md: g h toggles the headers popover open/closed
test('g h toggles the headers menu open and closed', async ({ page }) => {
	const reader = await openMessage(page, multi.subject);

	await reader.toggleHeaders();
	await expect(reader.headersPopover()).toBeVisible();

	await reader.toggleHeaders();
	await expect(reader.headersPopover()).toHaveCount(0);
});

// openspec/specs/ui-hotkeys/spec.md: g f opens the folder picker from the reader
test('g f opens the folder picker from the reader', async ({ page }) => {
	const reader = await openMessage(page, multi.subject);
	await reader.gotoFolderPicker();
	await expect(page.getByText('Open a folder')).toBeVisible();
});

// openspec/specs/ui-hotkeys/spec.md: g a opens the account picker from the reader
test('g a opens the account picker from the reader', async ({ page }) => {
	const reader = await openMessage(page, multi.subject);
	await reader.gotoAccountPicker();
	await expect(page.getByText('Open a maildir')).toBeVisible();
});
