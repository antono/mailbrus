/** Page object for folder navigation + the message list (incl. pagination). */
import { expect, type Locator, type Page } from '@playwright/test';

export class MailboxPage {
	constructor(private readonly page: Page) {}

	// ── Folder picker ───────────────────────────────────────────────────────────

	/** Folder names listed in the folder picker, in display order. */
	async listedFolders(): Promise<string[]> {
		await expect(this.page.getByText('Open a folder')).toBeVisible();
		return this.page.getByTestId('folders.curtain').getByTestId('palette.row').locator('.primary').allTextContents();
	}

	/** Open a folder by name; the message list appears afterwards. */
	async openFolder(name: string): Promise<void> {
		await expect(this.page.getByText('Open a folder')).toBeVisible();
		await this.page
			.getByTestId('folders.curtain').getByTestId('palette.row')
			.filter({ has: this.page.getByText(name, { exact: true }) })
			.first()
			.click();
		await expect(this.page.getByTestId('mail-list.container')).toBeVisible();
	}

	// ── Message list ────────────────────────────────────────────────────────────

	private messages(): Locator {
		return this.page.getByTestId('mail-list.message-row');
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
		await expect(this.page.getByTestId('reader.container')).toBeVisible();
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

	/** The currently selected (active) row's 0-based index, or -1 if none. */
	async selectedIndex(): Promise<number> {
		const active = this.messages().and(this.page.locator('.active')).first();
		if ((await active.count()) === 0) return -1;
		const idx = await active.getAttribute('data-msg-idx');
		return idx == null ? -1 : Number(idx);
	}

	/** `g g` — jump selection to the top of the list. */
	async jumpTop(): Promise<void> {
		await this.page.keyboard.press('g');
		await this.page.keyboard.press('g');
	}

	/** `G` — jump selection to the bottom of the list. */
	async jumpBottom(): Promise<void> {
		await this.page.keyboard.press('Shift+G');
	}

	// ── Search ─────────────────────────────────────────────────────────────────

	/** Open search (via `/` key), type a query, and submit it. */
	async search(query: string): Promise<void> {
		await this.page.keyboard.press('/');
		await this.page.getByTestId('mail-list.search-input').fill(query);
		await this.page.keyboard.press('Enter');
	}

	// ── Pagination ──────────────────────────────────────────────────────────────

	/** The breadcrumb pagination indicator, e.g. "2 / 4". */
	paginationInfo(): Locator {
		return this.page.getByTestId('mail-list.pagination-counter');
	}

	async nextPage(): Promise<void> {
		await this.page.getByTestId('mail-list.next-btn').click();
	}

	async prevPage(): Promise<void> {
		await this.page.getByTestId('mail-list.prev-btn').click();
	}
}
