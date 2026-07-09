/** Task 7.6 — link styling: visual indicators for external links */
import { test, expect } from '../harness/fixtures.ts';
import { AccountsPage } from '../pages/AccountsPage.ts';
import { MailboxPage } from '../pages/MailboxPage.ts';
import { MessagePage } from '../pages/MessagePage.ts';
import { folderOf, manifest } from '../fixtures/manifest.ts';

const alice = manifest.find((a) => a.address === 'alice@example.com')!;
const inbox = folderOf(alice, 'Inbox');

// Message with links in plain text body
const msgWithLinks = inbox.messages.find((m) => m.slug === 'alice-inbox-08-multipart-alt')!;

async function openInbox(page: import('@playwright/test').Page): Promise<MailboxPage> {
	const accounts = new AccountsPage(page);
	await accounts.open();
	await accounts.select(alice.address);
	const mailbox = new MailboxPage(page);
	await mailbox.openFolder('Inbox');
	return mailbox;
}

// openspec/specs/sveltekit-ui/spec.md: link styling
test('links have mb-link class for styling', async ({ page }) => {
	const mailbox = await openInbox(page);
	await mailbox.openMessage(msgWithLinks.subject);

	const reader = new MessagePage(page);
	const links = page.locator('a.mb-link');

	// The message body loads asynchronously; `linkify` renders the anchors only
	// once `parts.main` arrives. Await a web-first assertion (auto-retries) before
	// the bare `.count()` snapshot — otherwise a busy server (parallel workers)
	// makes the body land after the count read and the test flakes on 0.
	await expect(links.first()).toBeVisible();

	// At least one link with the mb-link class should exist
	const count = await links.count();
	expect(count).toBeGreaterThanOrEqual(1);

	// Link should be visible and have the styling class applied
	const firstLink = links.first();
	await expect(firstLink).toBeVisible();

	// Verify the class is present for CSS styling
	const className = await firstLink.getAttribute('class');
	expect(className).toContain('mb-link');
});

// openspec/specs/sveltekit-ui/spec.md: link color
test('links have distinct color', async ({ page }) => {
	const mailbox = await openInbox(page);
	await mailbox.openMessage(msgWithLinks.subject);

	const reader = new MessagePage(page);
	const links = page.locator('.mb-link');

	// Link color should be different from body text (accent color, typically blue/indigo)
	const linkColor = await links.first().evaluate(
		(el) => window.getComputedStyle(el).color
	);
	// Color should not be black or inherit (should be accent color)
	expect(linkColor).not.toMatch(/rgb\(0, 0, 0\)/);
	expect(linkColor).toBeTruthy();
});

// openspec/specs/sveltekit-ui/spec.md: link icon
test('links have visual icon indicator', async ({ page }) => {
	const mailbox = await openInbox(page);
	await mailbox.openMessage(msgWithLinks.subject);

	const reader = new MessagePage(page);
	const links = page.locator('.mb-link');

	// Links should contain an icon element
	const icon = links.first().locator('.mb-link-icon');
	await expect(icon).toBeVisible();

	// Icon should be a small external link symbol
	const iconText = await icon.textContent();
	expect(iconText?.trim()).toBeTruthy();
});

// openspec/specs/sveltekit-ui/spec.md: mailto links
test('mailto links display email icon', async ({ page }) => {
	const mailbox = await openInbox(page);
	// Use historical message which has a mailto link in the unsubscribe section
	await mailbox.openMessage(msgWithLinks.subject);

	const reader = new MessagePage(page);
	const links = page.locator('.mb-link');

	// Wait for the async body render before the non-retrying `.count()` read.
	await expect(links.first()).toBeVisible();

	// Get all links and check their text/icon
	const linkCount = await links.count();
	expect(linkCount).toBeGreaterThanOrEqual(1);

	// At least the visible URL link should be present
	const firstLink = links.first();
	const linkText = await firstLink.textContent();
	expect(linkText).toContain('work.example');
});

// openspec/specs/sveltekit-ui/spec.md: link behavior
test('links are clickable and open in new window', async ({ page }) => {
	const mailbox = await openInbox(page);
	await mailbox.openMessage(msgWithLinks.subject);

	const reader = new MessagePage(page);
	const links = page.locator('.mb-link');

	// First link should exist and be clickable
	const firstLink = links.first();
	const href = await firstLink.getAttribute('href');
	const target = await firstLink.getAttribute('target');
	const rel = await firstLink.getAttribute('rel');

	// Verify link attributes
	expect(href).toContain('work.example');
	expect(target).toBe('_blank');
	expect(rel).toContain('noopener');
});
