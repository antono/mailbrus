/** attachment-actions: HTML body as pill, download/open click action, attachmentAction setting. */
import { test, expect } from '../harness/fixtures.ts';
import { AccountsPage } from '../pages/AccountsPage.ts';
import { MailboxPage } from '../pages/MailboxPage.ts';
import { MessagePage } from '../pages/MessagePage.ts';
import { folderOf, manifest } from '../fixtures/manifest.ts';

const alice = manifest.find((a) => a.address === 'alice@example.com')!;
const inbox = folderOf(alice, 'Inbox');
const htmlOnlyMsg = inbox.messages.find((m) => m.slug === 'alice-inbox-07-html-only')!;
const multiAttachMsg = inbox.messages.find((m) => m.slug === 'alice-inbox-04-replied-multi')!;

async function openInbox(page: import('@playwright/test').Page): Promise<MailboxPage> {
	const accounts = new AccountsPage(page);
	await accounts.open();
	await accounts.select(alice.address);
	const mailbox = new MailboxPage(page);
	await mailbox.openFolder('Inbox');
	return mailbox;
}

async function openSettings(page: import('@playwright/test').Page): Promise<void> {
	await page.keyboard.press('Control+,');
	await expect(page.getByTestId('settings.panel')).toBeVisible();
}

// openspec/changes/ui-attachements/specs/attachment-actions/spec.md
test('HTML-only message shows message.html pill in attachment row', async ({ page }) => {
	const mailbox = await openInbox(page);
	await mailbox.openMessage(htmlOnlyMsg.subject);

	const reader = new MessagePage(page);
	await expect(reader.bodyLocator()).not.toBeEmpty();

	const names = await reader.attachmentNames();
	expect(names).toContain('message.html');
});

// openspec/changes/ui-attachements/specs/attachment-actions/spec.md: part_index in API
test('GET /api/messages/:id includes part_index on each attachment', async ({ app, request }) => {
	const res = await request.get(`${app.baseURL}/api/messages/${encodeURIComponent(multiAttachMsg.messageId)}`);
	expect(res.ok()).toBe(true);
	const data = (await res.json()) as { attachments: { name: string; part_index: number }[] };
	for (const att of data.attachments) {
		expect(typeof att.part_index).toBe('number');
	}
});

// openspec/changes/ui-attachements/specs/attachment-actions/spec.md: download endpoint
test('GET /api/messages/:id/attachments/:index returns raw bytes', async ({ app, request }) => {
	const msgRes = await request.get(`${app.baseURL}/api/messages/${encodeURIComponent(multiAttachMsg.messageId)}`);
	const data = (await msgRes.json()) as { attachments: { name: string; part_index: number; mime: string }[] };
	expect(data.attachments.length).toBeGreaterThan(0);

	const first = data.attachments[0];
	const dlRes = await request.get(
		`${app.baseURL}/api/messages/${encodeURIComponent(multiAttachMsg.messageId)}/attachments/${first.part_index}`
	);
	expect(dlRes.ok()).toBe(true);
	expect(dlRes.headers()['content-disposition']).toMatch(/attachment/);
});

// openspec/changes/ui-attachements/specs/attachment-actions/spec.md: unknown index → 404
test('GET /api/messages/:id/attachments/9999 returns 404', async ({ app, request }) => {
	const res = await request.get(
		`${app.baseURL}/api/messages/${encodeURIComponent(multiAttachMsg.messageId)}/attachments/9999`
	);
	expect(res.status()).toBe(404);
});

// openspec/changes/ui-attachements/specs/sveltekit-ui/spec.md: click action = download
test('clicking pill with action=download initiates a file download', async ({ page }) => {
	const mailbox = await openInbox(page);
	await mailbox.openMessage(multiAttachMsg.subject);

	const reader = new MessagePage(page);
	await expect(reader.bodyLocator()).not.toBeEmpty();

	// Switch to download mode via settings (use close button — Escape would also close the Reader)
	await openSettings(page);
	await page.getByTestId('settings.attachment-action-seg').getByRole('radio', { name: 'download' }).click();
	await page.getByTestId('settings.close-btn').click();

	// Clicking a pill in download mode should trigger a browser download event
	const [download] = await Promise.all([
		page.waitForEvent('download'),
		reader.attachments().first().click()
	]);
	expect(download.url()).toContain('/attachments/');
});

// openspec/changes/ui-attachements/specs/sveltekit-ui/spec.md: attachmentAction persists
test('attachmentAction setting persists across page reload', async ({ page }) => {
	const mailbox = await openInbox(page);
	await openSettings(page);

	await page.getByTestId('settings.attachment-action-seg').getByRole('radio', { name: 'download' }).click();
	await page.keyboard.press('Escape');

	await page.waitForTimeout(400);
	await page.reload();
	await expect(page.getByTestId('mail-list.container')).toBeVisible({ timeout: 15000 });

	await openSettings(page);
	const selected = await page
		.getByTestId('settings.attachment-action-seg')
		.locator('[data-state="on"]')
		.textContent();
	expect(selected?.trim()).toBe('download');
});

// openspec/changes/ui-attachements/specs/sveltekit-ui/spec.md: open-html button gone
test('"Open original HTML" button is not present in the reader', async ({ page }) => {
	const mailbox = await openInbox(page);
	await mailbox.openMessage(htmlOnlyMsg.subject);

	const reader = new MessagePage(page);
	await expect(reader.bodyLocator()).not.toBeEmpty();

	await expect(page.getByTestId('reader.open-html-btn')).toHaveCount(0);
});
