/** Page object for folder navigation + the message list (incl. pagination). */
import { expect, type Locator, type Page } from '@playwright/test';

export class MailboxPage {
	constructor(private readonly page: Page) {}

	// ── Folder picker ───────────────────────────────────────────────────────────

	/** Folder names listed in the folder picker, in display order. */
	async listedFolders(): Promise<string[]> {
		await expect(this.page.getByText('Open a folder')).toBeVisible();
		return this.page.locator('.mb-curtain .mb-row .primary').allTextContents();
	}

	/** Open a folder by name; the message list appears afterwards. */
	async openFolder(name: string): Promise<void> {
		await expect(this.page.getByText('Open a folder')).toBeVisible();
		await this.page
			.locator('.mb-curtain .mb-row')
			.filter({ has: this.page.getByText(name, { exact: true }) })
			.first()
			.click();
		await expect(this.page.locator('.mb-list-screen')).toBeVisible();
	}

	// ── Message list ────────────────────────────────────────────────────────────

	private messages(): Locator {
		return this.page.locator('.mb-mail-list .mb-msg');
	}

	/** Subjects of the messages currently rendered, in list order. */
	async subjects(): Promise<string[]> {
		return this.messages().locator('.subject').allTextContents();
	}

	messageRow(subject: string): Locator {
		return this.messages().filter({ has: this.page.getByText(subject, { exact: true }) });
	}

	/** Open a message by subject; the reader appears afterwards. */
	async openMessage(subject: string): Promise<void> {
		await this.messageRow(subject).first().click();
		await expect(this.page.locator('.mb-reader')).toBeVisible();
	}

	/** Whether the row for `subject` is styled unread. */
	async isUnread(subject: string): Promise<boolean> {
		const cls = (await this.messageRow(subject).first().getAttribute('class')) ?? '';
		return cls.split(/\s+/).includes('unread');
	}

	/** Mark the row for `subject` read via the `r` keyboard shortcut. */
	async markRead(subject: string): Promise<void> {
		// Hovering sets the list's selectedIdx; `r` acts on the selected row.
		await this.messageRow(subject).first().hover();
		await this.page.keyboard.press('r');
	}

	// ── Pagination ──────────────────────────────────────────────────────────────

	/** The breadcrumb pagination indicator, e.g. "page 2: 26–27 of 27". */
	paginationInfo(): Locator {
		return this.page.locator('.mb-list-screen .count').filter({ hasText: /page \d+:/ });
	}

	async nextPage(): Promise<void> {
		await this.page.getByRole('button', { name: 'Next page' }).click();
	}

	async prevPage(): Promise<void> {
		await this.page.getByRole('button', { name: 'Previous page' }).click();
	}
}
