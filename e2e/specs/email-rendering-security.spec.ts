/**
 * Rendering-mode and email security regression suite.
 *
 * Covers all three modes (Text, Simple, HTML), default-mode selection rules,
 * mode persistence, the iframe sandbox, and remote-content blocking.
 */
import { test, expect } from '../harness/fixtures.ts';
import { AccountsPage } from '../pages/AccountsPage.ts';
import { MailboxPage } from '../pages/MailboxPage.ts';
import { MessagePage } from '../pages/MessagePage.ts';
import { folderOf, hasHtmlBody, hasRemoteImages, manifest } from '../fixtures/manifest.ts';

const alice = manifest.find((a) => a.address === 'alice@example.com')!;
const inbox = folderOf(alice, 'Inbox');

const plainMsg = inbox.messages.find((m) => m.slug === 'alice-inbox-01-read-signed')!;
const htmlOnlyMsg = inbox.messages.find((m) => m.slug === 'alice-inbox-07-html-only')!;
const multipartMsg = inbox.messages.find((m) => m.slug === 'alice-inbox-08-multipart-alt')!;
const remoteMsg = inbox.messages.find((m) => m.slug === 'alice-inbox-09-html-remote-img')!;
// XSS attack-type fixtures
const scriptTagMsg = inbox.messages.find((m) => m.slug === 'alice-inbox-xss-01-script-tag')!;
const eventHandlerMsg = inbox.messages.find((m) => m.slug === 'alice-inbox-xss-02-event-handler')!;
const javascriptHrefMsg = inbox.messages.find((m) => m.slug === 'alice-inbox-xss-03-javascript-href')!;
const cssInjectionMsg = inbox.messages.find((m) => m.slug === 'alice-inbox-xss-04-css-injection')!;
const iframeInjectionMsg = inbox.messages.find((m) => m.slug === 'alice-inbox-xss-05-iframe-injection')!;
const metaRefreshMsg = inbox.messages.find((m) => m.slug === 'alice-inbox-xss-06-meta-refresh')!;

async function openAliceInbox(page: import('@playwright/test').Page): Promise<MailboxPage> {
	const accounts = new AccountsPage(page);
	await accounts.open();
	await accounts.select(alice.address);
	const mailbox = new MailboxPage(page);
	await mailbox.openFolder('Inbox');
	return mailbox;
}

// ── Fixture sanity ────────────────────────────────────────────────────────────

test('fixture sanity: HTML test messages are in the manifest', () => {
	expect(htmlOnlyMsg, 'alice-inbox-07-html-only must be in manifest').toBeTruthy();
	expect(multipartMsg, 'alice-inbox-08-multipart-alt must be in manifest').toBeTruthy();
	expect(remoteMsg, 'alice-inbox-09-html-remote-img must be in manifest').toBeTruthy();
	expect(hasHtmlBody(htmlOnlyMsg)).toBe(true);
	expect(hasHtmlBody(multipartMsg)).toBe(true);
	expect(hasRemoteImages(remoteMsg)).toBe(true);
});

// ── Default mode selection ────────────────────────────────────────────────────

test.describe('default mode selection', () => {
	test('plain-text message opens in Text mode by default', async ({ page }) => {
		const mailbox = await openAliceInbox(page);
		await mailbox.openMessage(plainMsg.subject);
		const reader = new MessagePage(page);
		await expect.poll(() => reader.activeMode()).toBe('text');
		await expect(reader.modeTextBtn()).toHaveAttribute('aria-pressed', 'true');
	});

	test('HTML-only message opens in Simple mode by default (no text/plain part)', async ({ page }) => {
		const mailbox = await openAliceInbox(page);
		await mailbox.openMessage(htmlOnlyMsg.subject);
		const reader = new MessagePage(page);
		await expect.poll(() => reader.activeMode()).toBe('simple');
		await expect(reader.modeTextBtn()).toBeDisabled();
	});

	test('multipart message with text/plain opens in Text mode by default', async ({ page }) => {
		const mailbox = await openAliceInbox(page);
		await mailbox.openMessage(multipartMsg.subject);
		const reader = new MessagePage(page);
		await expect.poll(() => reader.activeMode()).toBe('text');
	});

	test('HTML mode is never selected automatically', async ({ page }) => {
		const mailbox = await openAliceInbox(page);
		for (const m of [htmlOnlyMsg, multipartMsg, remoteMsg]) {
			await mailbox.openMessage(m.subject);
			const reader = new MessagePage(page);
			await expect.poll(() => reader.activeMode()).not.toBe('html');
			await reader.close();
			await expect(page.getByTestId('mail-list.container')).toBeVisible();
		}
	});
});

// ── Mode toggle UI ────────────────────────────────────────────────────────────

test.describe('mode toggle buttons', () => {
	test('all three mode buttons are always visible', async ({ page }) => {
		const mailbox = await openAliceInbox(page);
		await mailbox.openMessage(plainMsg.subject);
		const reader = new MessagePage(page);
		await expect(reader.modeTextBtn()).toBeVisible();
		await expect(reader.modeSimpleBtn()).toBeVisible();
		await expect(reader.modeHtmlBtn()).toBeVisible();
	});

	test('Text button is disabled when message has no text/plain part', async ({ page }) => {
		const mailbox = await openAliceInbox(page);
		await mailbox.openMessage(htmlOnlyMsg.subject);
		const reader = new MessagePage(page);
		await expect(reader.modeTextBtn()).toBeDisabled();
	});

	test('clicking Simple switches to Simple mode', async ({ page }) => {
		const mailbox = await openAliceInbox(page);
		await mailbox.openMessage(multipartMsg.subject);
		const reader = new MessagePage(page);
		await expect.poll(() => reader.activeMode()).toBe('text');
		await reader.modeSimpleBtn().click();
		await expect.poll(() => reader.activeMode()).toBe('simple');
		await expect(reader.htmlIframe()).not.toBeVisible();
	});

	test('clicking HTML switches to HTML mode and shows iframe', async ({ page }) => {
		const mailbox = await openAliceInbox(page);
		await mailbox.openMessage(multipartMsg.subject);
		const reader = new MessagePage(page);
		await reader.modeHtmlBtn().click();
		await expect.poll(() => reader.activeMode()).toBe('html');
		await expect(reader.htmlIframe()).toBeVisible();
	});
});

// ── HTML iframe sandbox ───────────────────────────────────────────────────────

test.describe('HTML iframe sandbox', () => {
	test('sandbox allows popups but blocks scripts and same-origin access', async ({ page }) => {
		const mailbox = await openAliceInbox(page);
		await mailbox.openMessage(multipartMsg.subject);
		const reader = new MessagePage(page);
		await reader.modeHtmlBtn().click();
		await expect(reader.htmlIframe()).toBeVisible();

		const sandbox = await reader.htmlIframe().getAttribute('sandbox');
		expect(sandbox).toContain('allow-popups');
		expect(sandbox).toContain('allow-popups-to-escape-sandbox');
		expect(sandbox).not.toContain('allow-scripts');
		expect(sandbox).not.toContain('allow-same-origin');
	});

	test('srcdoc contains CSP with default-src none and script-src none', async ({ page }) => {
		const mailbox = await openAliceInbox(page);
		await mailbox.openMessage(multipartMsg.subject);
		const reader = new MessagePage(page);
		await reader.modeHtmlBtn().click();
		await expect(reader.htmlIframe()).toBeVisible();

		const srcdoc = await reader.htmlIframe().getAttribute('srcdoc');
		expect(srcdoc).toContain("default-src 'none'");
		expect(srcdoc).toContain("script-src 'none'");
	});

	test('iframe srcdoc sets color-scheme light for dark-mode compatibility', async ({ page }) => {
		const mailbox = await openAliceInbox(page);
		await mailbox.openMessage(multipartMsg.subject);
		const reader = new MessagePage(page);
		await reader.modeHtmlBtn().click();
		await expect(reader.htmlIframe()).toBeVisible();

		const srcdoc = await reader.htmlIframe().getAttribute('srcdoc');
		expect(srcdoc).toContain('color-scheme');
		expect(srcdoc).toContain('light');
	});

	test('script tags in HTML body are stripped by sanitizer', async ({ page }) => {
		const mailbox = await openAliceInbox(page);
		await mailbox.openMessage(htmlOnlyMsg.subject);
		const reader = new MessagePage(page);
		await reader.modeHtmlBtn().click();
		await expect(reader.htmlIframe()).toBeVisible();

		const srcdoc = (await reader.htmlIframe().getAttribute('srcdoc')) ?? '';
		expect(srcdoc).not.toContain('<script>');
		expect(srcdoc).not.toContain('alert(');
	});

	test('email iframe cannot access __TAURI__ from the parent window', async ({ page }) => {
		const mailbox = await openAliceInbox(page);
		await mailbox.openMessage(multipartMsg.subject);
		const reader = new MessagePage(page);
		await reader.modeHtmlBtn().click();
		await expect(reader.htmlIframe()).toBeVisible();

		const frames = page.frames();
		const emailFrame = frames.find((f) => f !== page.mainFrame());
		if (emailFrame) {
			const tauriType = await emailFrame.evaluate(
				() => typeof (window as unknown as Record<string, unknown>).__TAURI__
			);
			expect(tauriType).toBe('undefined');
		}
	});
});

// ── Remote content blocking ───────────────────────────────────────────────────

test.describe('remote content blocking', () => {
	test('remote-content banner appears in HTML mode when message has remote images', async ({ page }) => {
		const mailbox = await openAliceInbox(page);
		await mailbox.openMessage(remoteMsg.subject);
		const reader = new MessagePage(page);
		await reader.modeHtmlBtn().click();
		await expect(reader.remoteBanner()).toBeVisible();
	});

	test('no remote banner when message has no remote resources', async ({ page }) => {
		const mailbox = await openAliceInbox(page);
		await mailbox.openMessage(multipartMsg.subject);
		const reader = new MessagePage(page);
		await reader.modeHtmlBtn().click();
		await expect(reader.htmlIframe()).toBeVisible();
		await expect(reader.remoteBanner()).not.toBeVisible();
	});

	test('clicking Load dismisses the remote-content banner', async ({ page }) => {
		const mailbox = await openAliceInbox(page);
		await mailbox.openMessage(remoteMsg.subject);
		const reader = new MessagePage(page);
		await reader.modeHtmlBtn().click();
		await expect(reader.remoteBanner()).toBeVisible();
		await reader.loadRemoteBtn().click();
		await expect(reader.remoteBanner()).not.toBeVisible();
	});

	test('remote src is neutralized in srcdoc before user opts in', async ({ page }) => {
		const mailbox = await openAliceInbox(page);
		await mailbox.openMessage(remoteMsg.subject);
		const reader = new MessagePage(page);
		await reader.modeHtmlBtn().click();
		await expect(reader.remoteBanner()).toBeVisible();

		const srcdoc = (await reader.htmlIframe().getAttribute('srcdoc')) ?? '';
		expect(srcdoc).toContain('data-mb-src=');
		expect(srcdoc).not.toMatch(/\ssrc="https?:/);
	});
});

// ── Mode persistence ──────────────────────────────────────────────────────────

test.describe('mode persistence', () => {
	test('Simple mode selection persists to the next message', async ({ page }) => {
		const mailbox = await openAliceInbox(page);
		await mailbox.openMessage(plainMsg.subject);
		const reader = new MessagePage(page);
		await reader.modeSimpleBtn().click();
		await expect.poll(() => reader.activeMode()).toBe('simple');
		await reader.close();
		await expect(page.getByTestId('mail-list.container')).toBeVisible();
		await mailbox.openMessage(multipartMsg.subject);
		await expect.poll(() => reader.activeMode()).toBe('simple');
	});

	test('HTML mode does NOT persist — next message opens in last text/simple mode', async ({ page }) => {
		const mailbox = await openAliceInbox(page);
		await mailbox.openMessage(plainMsg.subject);
		const reader = new MessagePage(page);
		await expect.poll(() => reader.activeMode()).toBe('text');
		await reader.modeHtmlBtn().click();
		await expect.poll(() => reader.activeMode()).toBe('html');
		await reader.close();
		await expect(page.getByTestId('mail-list.container')).toBeVisible();
		await mailbox.openMessage(multipartMsg.subject);
		await expect.poll(() => reader.activeMode()).not.toBe('html');
	});
});

// ── Simple mode content ───────────────────────────────────────────────────────

test.describe('Simple mode content', () => {
	test('Simple mode shows readable text without raw HTML tags', async ({ page }) => {
		const mailbox = await openAliceInbox(page);
		await mailbox.openMessage(htmlOnlyMsg.subject);
		const reader = new MessagePage(page);
		await expect.poll(() => reader.activeMode()).toBe('simple');
		const bodyText = await reader.bodyLocator().innerText();
		expect(bodyText).not.toMatch(/<p>|<strong>/);
		expect(bodyText.toLowerCase()).toContain('newsletter');
	});

	test('script content does not appear in Simple mode output', async ({ page }) => {
		const mailbox = await openAliceInbox(page);
		await mailbox.openMessage(htmlOnlyMsg.subject);
		const reader = new MessagePage(page);
		await expect.poll(() => reader.activeMode()).toBe('simple');
		const bodyText = (await reader.bodyLocator().innerText()).toLowerCase();
		expect(bodyText).not.toContain('alert(');
		expect(bodyText).not.toContain('<script>');
	});
});

// ── Text mode content ─────────────────────────────────────────────────────────

test.describe('Text mode content', () => {
	test('plain-text body is rendered and not empty', async ({ page }) => {
		const mailbox = await openAliceInbox(page);
		await mailbox.openMessage(plainMsg.subject);
		const reader = new MessagePage(page);
		await expect.poll(() => reader.activeMode()).toBe('text');
		await expect(reader.bodyLocator()).not.toBeEmpty();
	});

	test('URLs in plain text are linkified as clickable anchors', async ({ page }) => {
		const mailbox = await openAliceInbox(page);
		await mailbox.openMessage(multipartMsg.subject);
		const reader = new MessagePage(page);
		await expect.poll(() => reader.activeMode()).toBe('text');
		const link = reader.bodyLocator().locator('a[href="https://work.example/update"]');
		await expect(link).toBeVisible();
	});
});

// ── XSS attack-type regressions ───────────────────────────────────────────────
//
// Each fixture exercises one attack class. The sanitizer must neutralize it
// before the HTML ever reaches the client. Assertions check the rendered srcdoc
// in HTML mode (the most permissive rendering path) and the DOM in Simple mode.

test.describe('XSS attack regressions', () => {
	test('script-tag injection: <script> is stripped in HTML mode', async ({ page }) => {
		const mailbox = await openAliceInbox(page);
		await mailbox.openMessage(scriptTagMsg.subject);
		const reader = new MessagePage(page);
		await reader.modeHtmlBtn().click();
		await expect(reader.htmlIframe()).toBeVisible();
		const srcdoc = (await reader.htmlIframe().getAttribute('srcdoc')) ?? '';
		expect(srcdoc).not.toContain('<script');
		expect(srcdoc).not.toContain('pwned');
	});

	test('event-handler injection: on* attributes are stripped in HTML mode', async ({ page }) => {
		const mailbox = await openAliceInbox(page);
		await mailbox.openMessage(eventHandlerMsg.subject);
		const reader = new MessagePage(page);
		await reader.modeHtmlBtn().click();
		await expect(reader.htmlIframe()).toBeVisible();
		const srcdoc = (await reader.htmlIframe().getAttribute('srcdoc')) ?? '';
		expect(srcdoc).not.toMatch(/\bon\w+\s*=/);
	});

	test('javascript: href injection: href is removed or replaced in HTML mode', async ({ page }) => {
		const mailbox = await openAliceInbox(page);
		await mailbox.openMessage(javascriptHrefMsg.subject);
		const reader = new MessagePage(page);
		await reader.modeHtmlBtn().click();
		await expect(reader.htmlIframe()).toBeVisible();
		const srcdoc = (await reader.htmlIframe().getAttribute('srcdoc')) ?? '';
		expect(srcdoc.toLowerCase()).not.toContain('javascript:');
	});

	test('CSS injection: style attribute is stripped in HTML mode', async ({ page }) => {
		const mailbox = await openAliceInbox(page);
		await mailbox.openMessage(cssInjectionMsg.subject);
		const reader = new MessagePage(page);
		await reader.modeHtmlBtn().click();
		await expect(reader.htmlIframe()).toBeVisible();
		const srcdoc = (await reader.htmlIframe().getAttribute('srcdoc')) ?? '';
		expect(srcdoc).not.toContain('expression(');
		expect(srcdoc).not.toContain('behavior:');
	});

	test('iframe injection: nested <iframe> is stripped in HTML mode', async ({ page }) => {
		const mailbox = await openAliceInbox(page);
		await mailbox.openMessage(iframeInjectionMsg.subject);
		const reader = new MessagePage(page);
		await reader.modeHtmlBtn().click();
		await expect(reader.htmlIframe()).toBeVisible();
		const srcdoc = (await reader.htmlIframe().getAttribute('srcdoc')) ?? '';
		expect(srcdoc).not.toContain('<iframe');
	});

	test('meta-refresh injection: <meta> is stripped in HTML mode', async ({ page }) => {
		const mailbox = await openAliceInbox(page);
		await mailbox.openMessage(metaRefreshMsg.subject);
		const reader = new MessagePage(page);
		await reader.modeHtmlBtn().click();
		await expect(reader.htmlIframe()).toBeVisible();
		const srcdoc = (await reader.htmlIframe().getAttribute('srcdoc')) ?? '';
		expect(srcdoc).not.toContain('<meta');
	});
});
