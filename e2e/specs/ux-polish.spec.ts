/** UX-polish: about logo size, plain-text default, sticky-header animation. */
import { test, expect } from '../harness/fixtures.ts';
import { AccountsPage } from '../pages/AccountsPage.ts';
import { MailboxPage } from '../pages/MailboxPage.ts';
import { MessagePage } from '../pages/MessagePage.ts';
import { folderOf, manifest } from '../fixtures/manifest.ts';

const alice = manifest.find((a) => a.address === 'alice@example.com')!;
const inbox = folderOf(alice, 'Inbox');
const multipartMsg = inbox.messages.find((m) => m.slug === 'alice-inbox-08-multipart-alt')!;
const longBodyMsg = inbox.messages.find((m) => m.slug === 'alice-inbox-01-read-signed')!;

// openspec/specs/sveltekit-ui/spec.md: About dialog logo at 64×64, centered
test('About dialog renders logo at 64×64', async ({ page }) => {
	const accounts = new AccountsPage(page);
	await accounts.open();
	await accounts.select(alice.address);

	const mailbox = new MailboxPage(page);
	await mailbox.openFolder('Inbox');

	// Home crumb opens the About dialog.
	await page.getByTestId('breadcrumbs.home-btn').click();
	const about = page.getByTestId('about.dialog');
	await expect(about).toBeVisible();

	const logo = about.locator('img.mb-about-logo-img');
	await expect(logo).toBeVisible();

	const { rendered, natural } = await logo.evaluate((el) => ({
		rendered: { w: (el as HTMLImageElement).clientWidth, h: (el as HTMLImageElement).clientHeight },
		natural: { w: (el as HTMLImageElement).naturalWidth }
	}));

	expect(natural.w, 'SVG must have loaded (naturalWidth > 0)').toBeGreaterThan(0);
	expect(rendered.w).toBe(64);
	expect(rendered.h).toBe(64);
});

// openspec/specs/sveltekit-ui/spec.md: plain-text default when has_plain && no override
test('opens multipart message in text mode by default', async ({ page }) => {
	const accounts = new AccountsPage(page);
	await accounts.open();
	await accounts.select(alice.address);

	const mailbox = new MailboxPage(page);
	await mailbox.openFolder('Inbox');
	await mailbox.openMessage(multipartMsg.subject);

	// Reader must remain open while we poll mode (the plain-text-first override
	// re-fetches asynchronously — give the second fetch time to settle).
	await expect(page.getByTestId('reader.container')).toBeVisible();
	const textBtn = page.getByTestId('reader.mode-text');
	await expect(textBtn).toBeVisible();

	// has_plain=true + no per-sender override + no global pref → reader prefers text.
	// Use a direct locator assertion (auto-retries) on aria-pressed.
	await expect(textBtn).toHaveAttribute('aria-pressed', 'true');
});

// openspec/specs/sveltekit-ui/spec.md: reader sticky header animates on collapse
test('sticky header gains .is-compact when reader body scrolls past threshold', async ({ page }) => {
	const accounts = new AccountsPage(page);
	await accounts.open();
	await accounts.select(alice.address);

	const mailbox = new MailboxPage(page);
	await mailbox.openFolder('Inbox');
	await mailbox.openMessage(longBodyMsg.subject);

	const head = page.locator('.mb-reader-head');
	// Header starts in expanded state.
	await expect(head).not.toHaveClass(/is-compact/);

	// Short fixture bodies don't create scroll overflow. Inject a tall filler
	// inside the scroll container so scrollTop can advance, then scroll past
	// the 4px threshold and dispatch the synthetic scroll event the handler
	// listens for.
	await page.locator('.mb-reader-scroll').evaluate((el) => {
		const filler = document.createElement('div');
		filler.style.cssText = 'height: 2000px;';
		filler.setAttribute('data-testid', 'sticky-header-test-filler');
		el.appendChild(filler);
		(el as HTMLElement).scrollTop = 80;
		el.dispatchEvent(new Event('scroll', { bubbles: true }));
	});

	await expect(head).toHaveClass(/is-compact/);
	// Transition is declared on .meta so the collapse is animated.
	const meta = page.locator('.mb-reader-head .meta');
	const transition = await meta.evaluate((el) => window.getComputedStyle(el).transition);
	expect(transition).toContain('max-height');
});
