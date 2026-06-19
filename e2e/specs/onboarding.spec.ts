/**
 * Onboarding wizard E2E spec.
 *
 * Covers the full path from zero-account state through account creation to
 * the mailbox, plus the two negative paths (422 on bad credentials, 409 on
 * duplicate). Network interception is used for the happy-path create so the
 * test does not require a live IMAP server.
 */
// openspec/changes/accounts-dialog/specs/onboarding-wizard/spec.md
import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cloneCorpus, removeClone, type Clone } from '../harness/clone.ts';
import { writeEmptyFixtureConfig, renderAccountToml, type ConfigHandle } from '../harness/config.ts';
import { indexClone } from '../harness/notmuch.ts';
import { startServer, type ServerHandle } from '../harness/server.ts';
import { OnboardingPage } from '../pages/OnboardingPage.ts';

// ── helpers ────────────────────────────────────────────────────────────────

async function setup(): Promise<{ clone: Clone; config: ConfigHandle; server: ServerHandle; baseURL: string }> {
	const clone = await cloneCorpus();
	await indexClone(clone);
	const config = await writeEmptyFixtureConfig(clone);
	const server = await startServer({ clone, config });
	return { clone, config, server, baseURL: server.baseURL };
}

async function teardown(clone: Clone | undefined, server: ServerHandle | undefined): Promise<void> {
	if (server) await server.stop();
	await removeClone(clone);
}

// ── happy path ─────────────────────────────────────────────────────────────

test('empty accounts → wizard shown → mocked create → sync → go to inbox', async ({ page }) => {
	// openspec/changes/accounts-dialog/specs/onboarding-wizard/spec.md: happy path
	let clone: Clone | undefined;
	let server: ServerHandle | undefined;
	try {
		({ clone, server } = await setup());

		const ACCOUNT_ID = 'wizard@test.local';
		const ACCOUNT_SUMMARY = { id: ACCOUNT_ID, email: ACCOUNT_ID, protocol: 'imap', display_name: null };

		// Mock POST /api/accounts → 201 (no real IMAP needed)
		// Mock POST /api/sync/... → 202
		// Mock GET /api/maildirs → immediate non-empty for the polling step
		await page.route('**/api/accounts', async (route) => {
			if (route.request().method() === 'POST') {
				await route.fulfill({
					status: 201,
					contentType: 'application/json',
					body: JSON.stringify(ACCOUNT_SUMMARY)
				});
			} else {
				// GET /api/accounts — keep real (shows [] before create, irrelevant after)
				await route.continue();
			}
		});

		await page.route(`**/api/sync/${encodeURIComponent(ACCOUNT_ID)}`, async (route) => {
			if (route.request().method() === 'POST') {
				await route.fulfill({ status: 202, contentType: 'application/json', body: '{"job":"wizard@test.local"}' });
			} else {
				await route.continue();
			}
		});

		// Polling: first call returns the account with total > 0 so polling ends fast.
		let maildirsCallCount = 0;
		await page.route('**/api/maildirs', async (route) => {
			maildirsCallCount++;
			if (maildirsCallCount <= 2) {
				await route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify([{ id: ACCOUNT_ID, address: ACCOUNT_ID, maildir: '/tmp/test', unread: 0, total: 1 }])
				});
			} else {
				await route.continue();
			}
		});

		await page.goto(server.baseURL);

		const wizard = new OnboardingPage(page);
		await wizard.expectVisible();

		// Form is visible with correct title
		await expect(page.getByTestId('onboarding-wizard.title')).toContainText('Welcome to Mailbrus');

		// Fill and submit
		await wizard.fillForm({
			email: ACCOUNT_ID,
			imapHost: 'imap.test.local',
			imapPort: 993,
			imapTls: true,
			secret: 'hunter2'
		});
		await wizard.submit();

		// Success phase
		await wizard.expectCreated();
		await expect(page.getByText(ACCOUNT_ID)).toBeVisible();

		// Sync → Go to inbox
		await wizard.syncNow();
		await wizard.goToInbox();

		// Wizard dismissed; mailbox view replaces it
		await wizard.expectDismissed();
		// The account picker overlay should be visible (phase = 'account' after onAccountReady)
		await expect(page.getByTestId('accounts.curtain')).toBeVisible({ timeout: 10_000 });
	} finally {
		await teardown(clone, server);
	}
});

// ── negative: 422 on connection failure ───────────────────────────────────

test('invalid IMAP host → 422 → inline error shown without clearing form', async ({ page }) => {
	// openspec/changes/accounts-dialog/specs/onboarding-wizard/spec.md: 422 path
	let clone: Clone | undefined;
	let server: ServerHandle | undefined;
	try {
		({ clone, server } = await setup());

		await page.goto(server.baseURL);
		const wizard = new OnboardingPage(page);
		await wizard.expectVisible();

		// Port 1 on loopback — connection will be refused immediately.
		await wizard.fillForm({
			email: 'bad@test.local',
			imapHost: '127.0.0.1',
			imapPort: 1,
			imapTls: false,
			secret: 'nopass'
		});
		await wizard.submit();

		// Wait for submit button to re-enable (submitting = false)
		await expect(page.getByTestId('onboarding-wizard.submit')).toBeEnabled({ timeout: 30_000 });

		// The wizard stays on the form phase with an inline error; inputs are preserved.
		await expect(page.getByTestId('onboarding-wizard.form')).toBeVisible();
		// Server returns { field: "imap_host" } for connection failures → field-level error.
		const fieldErr = await wizard.fieldError('imap-host');
		expect(fieldErr, 'expected an inline error on imap_host field from 422').toBeTruthy();

		// Email field retains its value — form was not cleared.
		await expect(page.getByTestId('onboarding-wizard.email')).toHaveValue('bad@test.local');
	} finally {
		await teardown(clone, server);
	}
});

// ── negative: 409 on duplicate ────────────────────────────────────────────

test('existing account file → POST /api/accounts → 409 → email field error', async ({ page }) => {
	// openspec/changes/accounts-dialog/specs/onboarding-wizard/spec.md: 409 path
	let clone: Clone | undefined;
	let server: ServerHandle | undefined;
	try {
		const { clone: c, config, server: s, baseURL } = await setup();
		clone = c;
		server = s;

		// Pre-write the account file directly so the server sees it as a duplicate.
		const existingEmail = 'existing@test.local';
		const toml = renderAccountToml({ id: existingEmail, maildirRoot: join(clone.maildir, existingEmail) });
		await writeFile(join(config.accountsDir, `${existingEmail}.toml`), toml);

		await page.goto(baseURL);
		const wizard = new OnboardingPage(page);
		await wizard.expectVisible();

		await wizard.fillForm({
			email: existingEmail,
			imapHost: '127.0.0.1',
			imapPort: 1,
			imapTls: false,
			secret: 'irrelevant'
		});

		// Mock POST /api/accounts to return 409 — simulates the server reaching the
		// duplicate-check step (regardless of connection test outcome).
		await page.route('**/api/accounts', async (route) => {
			if (route.request().method() === 'POST') {
				await route.fulfill({
					status: 409,
					contentType: 'application/json',
					body: JSON.stringify({ error: 'account already exists' })
				});
			} else {
				await route.continue();
			}
		});

		await wizard.submit();

		// Wait for submit to finish
		await expect(page.getByTestId('onboarding-wizard.submit')).toBeEnabled({ timeout: 10_000 });

		// Email field shows the duplicate error
		const emailErr = await wizard.fieldError('email');
		expect(emailErr, 'expected duplicate-account error on email field').toBeTruthy();
		expect(emailErr).toMatch(/already exists/i);

		// Still on the form phase
		await expect(page.getByTestId('onboarding-wizard.form')).toBeVisible();
	} finally {
		await teardown(clone, server);
	}
});
