/** Page object for the account / maildir picker (the initial palette). */
import { expect, type Locator, type Page } from '@playwright/test';

export class AccountsPage {
	constructor(private readonly page: Page) {}

	private rows(): Locator {
		return this.page.locator('.mb-curtain .mb-row');
	}

	/** Load the app and wait for the account picker to be shown. */
	async open(): Promise<void> {
		await this.page.goto('/');
		await expect(this.page.getByText('Open a maildir')).toBeVisible();
		await expect(this.rows().first()).toBeVisible();
	}

	/** Email addresses listed in the picker, in display order. */
	async listedAddresses(): Promise<string[]> {
		await expect(this.rows().first()).toBeVisible();
		return this.page.locator('.mb-curtain .mb-row .primary').allTextContents();
	}

	/** Select an account; the folder picker appears afterwards. */
	async select(address: string): Promise<void> {
		await this.rows()
			.filter({ has: this.page.getByText(address, { exact: true }) })
			.first()
			.click();
		await expect(this.page.getByText('Open a folder')).toBeVisible();
	}
}
