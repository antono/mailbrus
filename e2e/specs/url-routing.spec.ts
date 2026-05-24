/** Tasks 8.1-8.5 — URL routing: deep-link, reload, back/forward, invalid links, server shell. */
import { test, expect } from '../harness/fixtures.ts';
import { AccountsPage } from '../pages/AccountsPage.ts';
import { MailboxPage } from '../pages/MailboxPage.ts';
import { MessagePage } from '../pages/MessagePage.ts';
import { folderOf, manifest } from '../fixtures/manifest.ts';

const alice = manifest.find((a) => a.address === 'alice@example.com')!;
const inbox = folderOf(alice, 'Inbox');
const readMsg = inbox.messages.find((m) => m.slug === 'alice-inbox-01-read-signed')!;

async function openInbox(page: import('@playwright/test').Page): Promise<MailboxPage> {
	const accounts = new AccountsPage(page);
	await accounts.open();
	await accounts.select(alice.address);
	const mailbox = new MailboxPage(page);
	await mailbox.openFolder('Inbox');
	return mailbox;
}

// ── 8.1: navigation updates URL ─────────────────────────────────────────────

// openspec/specs/sveltekit-frontend-scaffold/spec.md: URL update on navigation
test('opening a folder updates the URL to /folder/:id', async ({ page }) => {
	const accounts = new AccountsPage(page);
	await accounts.open();
	await accounts.select(alice.address);
	const mailbox = new MailboxPage(page);
	await mailbox.openFolder('Inbox');

	await expect(page).toHaveURL(/\/folder\/.+/);
});

test('opening a message updates the URL to /folder/:id/message/:mid', async ({ page }) => {
	const mailbox = await openInbox(page);
	await mailbox.openMessage(readMsg.subject);

	await expect(page).toHaveURL(/\/folder\/.+\/message\/.+/);
});

test('submitting a search updates the URL to /search?q=', async ({ page }) => {
	const mailbox = await openInbox(page);
	await mailbox.search('roadmap');

	await expect(page).toHaveURL(/\/search\?q=roadmap/);
});

// ── 8.2: deep-link / reload restores the view ───────────────────────────────

test('reloading on a folder URL restores the folder list', async ({ page }) => {
	const mailbox = await openInbox(page);
	const folderUrl = page.url();
	expect(folderUrl).toMatch(/\/folder\/.+/);

	await page.reload();
	await expect(page.getByTestId('mail-list.container')).toBeVisible();
});

test('reloading on a message URL restores folder list with reader open', async ({ page }) => {
	const mailbox = await openInbox(page);
	await mailbox.openMessage(readMsg.subject);
	const messageUrl = page.url();
	expect(messageUrl).toMatch(/\/folder\/.+\/message\/.+/);

	await page.reload();
	await expect(page.getByTestId('reader.container')).toBeVisible();
});

test('navigating directly to a search URL keeps the URL and loads the app', async ({ app, page }) => {
	await page.goto(`${app.baseURL}/search?q=roadmap`);
	// The app boots at the search URL; MailList needs a folder context so it shows
	// after the user picks an account + folder. URL must be preserved.
	await expect(page.locator('.mb-app')).toBeVisible();
	await expect(page).toHaveURL(/\/search\?q=roadmap/);
});

// ── 8.3: browser Back/Forward ────────────────────────────────────────────────

test('Back navigates from message to folder list', async ({ page }) => {
	const mailbox = await openInbox(page);
	await mailbox.openMessage(readMsg.subject);
	await expect(page).toHaveURL(/\/message\//);

	await page.goBack();
	await expect(page).toHaveURL(/\/folder\/[^/]+$/);
	await expect(page.getByTestId('mail-list.container')).toBeVisible();
	await expect(page.getByTestId('reader.container')).not.toBeVisible();
});

test('Forward re-opens message after Back', async ({ page }) => {
	const mailbox = await openInbox(page);
	await mailbox.openMessage(readMsg.subject);
	await page.goBack();
	await expect(page).toHaveURL(/\/folder\/[^/]+$/);

	await page.goForward();
	await expect(page).toHaveURL(/\/message\//);
	await expect(page.getByTestId('reader.container')).toBeVisible();
});

// ── 8.4: invalid deep links fall back gracefully ─────────────────────────────

test('deep link to unknown folder falls back and replaces URL', async ({ app, page }) => {
	await page.goto(`${app.baseURL}/folder/nonexistent-folder-xyz`);
	await expect(page.locator('.mb-app')).toBeVisible();
	// Account picker may appear first (no persisted account); app must not crash
	// and must eventually stop showing the bad folder ID in the URL
	await expect(page).not.toHaveURL(/nonexistent-folder-xyz/, { timeout: 15000 });
});

test('deep link to unknown message falls back to folder URL', async ({ page }) => {
	const mailbox = await openInbox(page);
	const folderUrl = page.url();
	const folderId = folderUrl.match(/\/folder\/([^/]+)/)?.[1];
	expect(folderId).toBeTruthy();

	await page.goto(`${page.url().replace(/\/message\/.*$/, '')}/message/nonexistent-msg-xyz`);
	// should fall back to folder, replacing the bad URL
	await expect(page.locator('.mb-app')).toBeVisible();
	await expect(page).not.toHaveURL(/nonexistent-msg-xyz/);
});

// ── 8.5: server serves SPA shell for in-grammar paths ────────────────────────

test('server serves the SPA shell for /folder/:id deep path', async ({ app, request }) => {
	const res = await request.get(`${app.baseURL}/folder/Inbox`);
	// tower-http's not_found_service returns 404 with the HTML shell body
	expect([200, 404]).toContain(res.status());
	const body = await res.text();
	expect(body).toContain('<html');
});

test('static assets are not shadowed by SPA fallback', async ({ app, request }) => {
	// The built app always has a favicon / manifest; verify /manifest.webmanifest resolves directly
	const res = await request.get(`${app.baseURL}/manifest.webmanifest`);
	// 200 (found) or 404 if the fixture server doesn't serve it — but must NOT return the HTML shell
	const body = await res.text();
	expect(body).not.toContain('<html');
});
