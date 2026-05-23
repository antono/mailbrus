/** Settings panel: open/close mechanics, every UI pref applies and persists. */
import { test, expect } from '../harness/fixtures.ts';
import { AccountsPage } from '../pages/AccountsPage.ts';
import { MailboxPage } from '../pages/MailboxPage.ts';
import { manifest, folderOf } from '../fixtures/manifest.ts';

const alice = manifest.find((a) => a.address === 'alice@example.com')!;
const inbox = folderOf(alice, 'Inbox');

async function openMailbox(page: import('@playwright/test').Page): Promise<MailboxPage> {
	const accounts = new AccountsPage(page);
	await accounts.open();
	await accounts.select(alice.address);
	const mailbox = new MailboxPage(page);
	await mailbox.openFolder(inbox.name);
	return mailbox;
}

async function openSettings(page: import('@playwright/test').Page): Promise<void> {
	await page.keyboard.press('Control+,');
	await expect(page.getByTestId('settings.panel')).toBeVisible();
}

// ── Open / close ─────────────────────────────────────────────────────────────

test('settings panel opens via command palette', async ({ page }) => {
	await openMailbox(page);
	await page.keyboard.press('Control+k');
	await expect(page.getByTestId('commands.curtain')).toBeVisible();
	await page.keyboard.type('settings');
	await page.getByTestId('commands.curtain').getByText('Open settings').waitFor();
	await page.getByTestId('commands.curtain').getByTestId('palette.row').first().click();
	await expect(page.getByTestId('settings.panel')).toBeVisible();
});

test('settings panel opens with Ctrl+, shortcut', async ({ page }) => {
	await openMailbox(page);
	await page.keyboard.press('Control+,');
	await expect(page.getByTestId('settings.panel')).toBeVisible();
});

test('settings panel closes with Escape', async ({ page }) => {
	await openMailbox(page);
	await openSettings(page);
	await page.keyboard.press('Escape');
	await expect(page.getByTestId('settings.panel')).not.toBeVisible();
});

test('settings panel closes with close button', async ({ page }) => {
	await openMailbox(page);
	await openSettings(page);
	await page.getByTestId('settings.close-btn').click();
	await expect(page.getByTestId('settings.panel')).not.toBeVisible();
});

test('settings panel closes by clicking outside', async ({ page }) => {
	await openMailbox(page);
	await openSettings(page);
	// click top-left corner, well outside the centered panel
	await page.mouse.click(10, 10);
	await expect(page.getByTestId('settings.panel')).not.toBeVisible();
});

// ── Dark mode ─────────────────────────────────────────────────────────────────

test('dark mode toggle adds .dark class to <html>', async ({ page }) => {
	await openMailbox(page);
	await openSettings(page);

	const wasDark = await page.locator('html').evaluate((el) => el.classList.contains('dark'));
	await page.getByTestId('settings.dark-toggle').click();

	if (wasDark) {
		await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
	} else {
		await expect(page.locator('html')).toHaveClass(/\bdark\b/);
	}
});

test('toggle-dark command flips dark mode and settings switch reflects it', async ({ page }) => {
	await openMailbox(page);

	// flip via command palette
	await page.keyboard.press('Control+k');
	await expect(page.getByTestId('commands.curtain')).toBeVisible();
	await page.keyboard.type('dark');
	await page.getByTestId('commands.curtain').getByTestId('palette.row').first().click();
	const isDark = await page.locator('html').evaluate((el) => el.classList.contains('dark'));

	// settings switch should reflect the new state
	await openSettings(page);
	const switchState = await page.getByTestId('settings.dark-toggle').getAttribute('data-state');
	expect(switchState).toBe(isDark ? 'checked' : 'unchecked');
});

// ── Accent color ──────────────────────────────────────────────────────────────

test('selecting Blue accent sets data-accent="blue" on <html>', async ({ page }) => {
	await openMailbox(page);
	await openSettings(page);

	await page.getByTestId('settings.accent-select').click();
	await page.getByRole('option', { name: 'Blue' }).click();

	await expect(page.locator('html')).toHaveAttribute('data-accent', 'blue');
});

test('accent select trigger shows selected label', async ({ page }) => {
	await openMailbox(page);
	await openSettings(page);

	await page.getByTestId('settings.accent-select').click();
	await page.getByRole('option', { name: 'Rose' }).click();

	// bits-ui Select.Value renders the raw value string (lowercase)
	await expect(page.getByTestId('settings.accent-select')).toContainText('rose');
});

// ── Font family ───────────────────────────────────────────────────────────────

test('selecting mono font sets --font-app to mono stack', async ({ page }) => {
	await openMailbox(page);
	await openSettings(page);

	await page.getByTestId('settings.font-seg').getByRole('radio', { name: 'mono' }).click();

	const fontApp = await page.evaluate(() =>
		document.documentElement.style.getPropertyValue('--font-app').trim()
	);
	expect(fontApp).toContain('--font-mono');
});

test('selecting sans font sets --font-app to sans stack', async ({ page }) => {
	await openMailbox(page);
	await openSettings(page);

	await page.getByTestId('settings.font-seg').getByRole('radio', { name: 'mono' }).click();
	await page.getByTestId('settings.font-seg').getByRole('radio', { name: 'sans' }).click();

	const fontApp = await page.evaluate(() =>
		document.documentElement.style.getPropertyValue('--font-app').trim()
	);
	expect(fontApp).toContain('--font-sans');
});

// ── Font size ─────────────────────────────────────────────────────────────────

test('font size lg sets --font-size-app to 15px', async ({ page }) => {
	await openMailbox(page);
	await openSettings(page);

	await page.getByTestId('settings.font-size-seg').getByRole('radio', { name: 'lg' }).click();

	const fontSize = await page.evaluate(() =>
		document.documentElement.style.getPropertyValue('--font-size-app').trim()
	);
	expect(fontSize).toBe('15px');
});

test('font size lg visually applies to body element', async ({ page }) => {
	await openMailbox(page);
	await openSettings(page);

	await page.getByTestId('settings.font-size-seg').getByRole('radio', { name: 'lg' }).click();
	await page.getByTestId('settings.close-btn').click();

	const computedSize = await page.evaluate(() =>
		window.getComputedStyle(document.body).fontSize
	);
	expect(computedSize).toBe('15px');
});

test('font size xs sets --font-size-app to 11px', async ({ page }) => {
	await openMailbox(page);
	await openSettings(page);

	await page.getByTestId('settings.font-size-seg').getByRole('radio', { name: 'xs' }).click();

	const fontSize = await page.evaluate(() =>
		document.documentElement.style.getPropertyValue('--font-size-app').trim()
	);
	expect(fontSize).toBe('11px');
});

test('font size sm sets --font-size-app to 12px', async ({ page }) => {
	await openMailbox(page);
	await openSettings(page);

	await page.getByTestId('settings.font-size-seg').getByRole('radio', { name: 'sm' }).click();

	const fontSize = await page.evaluate(() =>
		document.documentElement.style.getPropertyValue('--font-size-app').trim()
	);
	expect(fontSize).toBe('12px');
});

// ── Density ───────────────────────────────────────────────────────────────────

test('density spacious adds dens-spacious class to mail list', async ({ page }) => {
	await openMailbox(page);
	await openSettings(page);

	await page.getByTestId('settings.density-seg').getByRole('radio', { name: 'spacious' }).click();
	await page.keyboard.press('Escape');

	await expect(page.locator('.dens-spacious')).toBeVisible();
});

test('density dense adds dens-dense class to mail list', async ({ page }) => {
	await openMailbox(page);
	await openSettings(page);

	await page.getByTestId('settings.density-seg').getByRole('radio', { name: 'dense' }).click();
	await page.keyboard.press('Escape');

	await expect(page.locator('.dens-dense')).toBeVisible();
});

// ── Key hints ─────────────────────────────────────────────────────────────────

test('disabling key hints hides the hint bar', async ({ page }) => {
	await openMailbox(page);
	await expect(page.locator('.mb-hints')).toBeVisible();

	await openSettings(page);
	await page.getByTestId('settings.hints-toggle').click();
	await page.getByTestId('settings.close-btn').click();

	await expect(page.locator('.mb-hints')).not.toBeVisible();
});

test('re-enabling key hints shows the hint bar', async ({ page }) => {
	await openMailbox(page);
	await openSettings(page);

	// toggle off — hint bar disappears (dialog still open)
	await page.getByTestId('settings.hints-toggle').click();
	await expect(page.locator('.mb-hints')).not.toBeVisible();

	// toggle on — hint bar reappears (dialog still open, behind overlay)
	await page.getByTestId('settings.hints-toggle').click();
	await expect(page.locator('.mb-hints')).toBeVisible();

	// close via button to avoid Escape cancelling the focused switch
	await page.getByTestId('settings.close-btn').click();
	await expect(page.locator('.mb-hints')).toBeVisible();
});

// ── Persistence ───────────────────────────────────────────────────────────────

async function reloadToMailbox(page: import('@playwright/test').Page): Promise<void> {
	await page.waitForTimeout(400); // let async IDB write commit before unloading
	await page.reload();
	await expect(page.getByText('Open a maildir')).toBeVisible();
	await page.getByText(alice.address, { exact: true }).click();
	const mailbox = new MailboxPage(page);
	await mailbox.openFolder(inbox.name);
}

test('font size persists across page reload', async ({ page }) => {
	await openMailbox(page);
	await openSettings(page);
	await page.getByTestId('settings.font-size-seg').getByRole('radio', { name: 'lg' }).click();
	await page.keyboard.press('Escape');

	await reloadToMailbox(page);

	const fontSize = await page.evaluate(() =>
		document.documentElement.style.getPropertyValue('--font-size-app').trim()
	);
	expect(fontSize).toBe('15px');
});

test('dark mode persists across page reload', async ({ page }) => {
	await openMailbox(page);
	await openSettings(page);

	// ensure dark is on
	const state = await page.getByTestId('settings.dark-toggle').getAttribute('data-state');
	if (state !== 'checked') await page.getByTestId('settings.dark-toggle').click();
	await page.keyboard.press('Escape');

	await reloadToMailbox(page);

	await expect(page.locator('html')).toHaveClass(/\bdark\b/);
});

test('accent color persists across page reload', async ({ page }) => {
	await openMailbox(page);
	await openSettings(page);
	await page.getByTestId('settings.accent-select').click();
	await page.getByRole('option', { name: 'Green' }).click();
	await page.keyboard.press('Escape');

	await reloadToMailbox(page);

	await expect(page.locator('html')).toHaveAttribute('data-accent', 'green');
});
