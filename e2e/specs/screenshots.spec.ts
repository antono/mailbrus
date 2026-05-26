/** On-demand documentation screenshot scenarios. Run via: deno task screenshots */
import { test, expect } from '../harness/fixtures.ts';
import { AccountsPage } from '../pages/AccountsPage.ts';
import { MailboxPage } from '../pages/MailboxPage.ts';
import { MessagePage } from '../pages/MessagePage.ts';
import { folderOf, manifest } from '../fixtures/manifest.ts';
import fs from 'node:fs';

const alice = manifest.find((a) => a.address === 'alice@example.com')!;
const inbox = folderOf(alice, 'Inbox');
const readMsg = inbox.messages.find((m) => m.slug === 'alice-inbox-01-read-signed')!;

// Absolute path resolved from this file — unaffected by cwd at invocation time.
const SHOTS_DIR = new URL('../../docs/screenshots', import.meta.url).pathname;

test.beforeAll(() => {
	fs.mkdirSync(SHOTS_DIR, { recursive: true });
});

/**
 * Write visual prefs to IDB after the app has already initialized the database.
 * IDB data persists within the browser context, so the NEXT page load reads them.
 * Must be followed by page.reload() or a new navigation to take effect.
 */
async function seedPrefs(page: import('@playwright/test').Page): Promise<void> {
	// String form keeps browser globals (indexedDB) out of Deno's type checker.
	await page.evaluate(`
		new Promise(function(resolve, reject) {
			var req = indexedDB.open('mailbrus', 1);
			req.onsuccess = function() {
				var t = req.result.transaction('settings', 'readwrite');
				var r = t.objectStore('settings').put({
					key: 'ui_prefs',
					value: { dark: true, accent: 'amber', font: 'mono', fontSize: 'md', density: 'twoline', hintBar: true }
				});
				r.onsuccess = function() { resolve(undefined); };
				r.onerror   = function() { reject(r.error); };
			};
			req.onerror = function() { reject(req.error); };
		})
	`);
	await page.waitForTimeout(100); // let the IDB transaction commit
}

/** Wait for network idle and disable animations/caret blink before capturing. */
async function preCapture(page: import('@playwright/test').Page): Promise<void> {
	await page.waitForLoadState('networkidle');
	await page.addStyleTag({
		content: '* { transition: none !important; animation: none !important; caret-color: transparent !important; }'
	});
}

/**
 * Navigate to the inbox with screenshot prefs active.
 * First load initialises IDB; prefs are seeded then the page is reloaded so
 * the app reads dark/amber/mono on the second (real) load.
 */
async function openInbox(page: import('@playwright/test').Page): Promise<MailboxPage> {
	const accounts = new AccountsPage(page);
	await accounts.open();   // first load — app initialises IDB
	await seedPrefs(page);   // write prefs, wait for IDB commit
	await page.reload();     // reload: app reads dark/amber/mono from IDB
	await accounts.select(alice.address);
	const mailbox = new MailboxPage(page);
	await mailbox.openFolder('Inbox');
	return mailbox;
}

// openspec/changes/e2e-screenshot-scenarios/specs/e2e-screenshots/spec.md: captures populated message list
test('captures message-list.png', async ({ page }) => {
	await openInbox(page);
	await page.waitForSelector('[data-testid="mail-list.message-row"]');
	await preCapture(page);
	await page.screenshot({ path: `${SHOTS_DIR}/message-list.png` });
});

// openspec/changes/e2e-screenshot-scenarios/specs/e2e-screenshots/spec.md: captures open message in reader
test('captures reader.png', async ({ page }) => {
	const mailbox = await openInbox(page);
	await mailbox.openMessage(readMsg.subject);
	const reader = new MessagePage(page);
	await expect(reader.bodyLocator()).not.toBeEmpty();
	await preCapture(page);
	await page.screenshot({ path: `${SHOTS_DIR}/reader.png` });
});

// openspec/changes/e2e-screenshot-scenarios/specs/e2e-screenshots/spec.md: captures account picker
test('captures accounts.png', async ({ page }) => {
	const accounts = new AccountsPage(page);
	await accounts.open();   // first load — app initialises IDB
	await seedPrefs(page);   // write prefs
	await page.reload();     // reload: dark/amber/mono now active
	await preCapture(page);
	await page.screenshot({ path: `${SHOTS_DIR}/accounts.png` });
});

// openspec/changes/e2e-screenshot-scenarios/specs/e2e-screenshots/spec.md: captures compose with realistic draft
test('captures compose.png', async ({ page }) => {
	await openInbox(page);
	await page.keyboard.press('c');
	await page.waitForSelector('[data-testid="compose.container"]');
	await page.fill('[data-testid="compose.to-input"]', 'frank@client.example');
	await page.fill('[data-testid="compose.subject-input"]', 'Project update for next week');
	await page.fill('[data-testid="compose.body"]', 'Hi Frank,\n\nQuick update: the migration is on track for Saturday.\nExpect the staging cluster back up by Sunday morning.\n\nBest,\nAlice');
	await preCapture(page);
	await page.screenshot({ path: `${SHOTS_DIR}/compose.png` });
});

// openspec/changes/e2e-screenshot-scenarios/specs/e2e-screenshots/spec.md: captures About dialog over message list
test('captures about-over-list.png', async ({ page }) => {
	await openInbox(page);
	await page.waitForSelector('[data-testid="mail-list.message-row"]');
	// Trigger the real About dialog via the breadcrumbs home button (no test-only overlay).
	await page.getByTestId('breadcrumbs.home-btn').click();
	await page.waitForSelector('[data-testid="about.dialog"]');
	await preCapture(page);
	await page.screenshot({ path: `${SHOTS_DIR}/about-over-list.png` });
});
