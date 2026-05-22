/** Page object for the open-message reader (headers, body, attachments, sig). */
import { type Locator, type Page } from '@playwright/test';

export class MessagePage {
	constructor(private readonly page: Page) {}

	private root(): Locator {
		return this.page.getByTestId('reader.container');
	}

	/** Subject element (may include the relative-time suffix). Use for assertions. */
	subjectLocator(): Locator {
		return this.root().locator('.sub-text').first();
	}

	/** From/To metadata block. Use for assertions. */
	metaLocator(): Locator {
		return this.root().locator('.mb-reader-head .meta');
	}

	/** Message body element (body loads asynchronously). Use for assertions. */
	bodyLocator(): Locator {
		return this.root().locator('.mb-reader-body');
	}

	private signatureIcon(): Locator {
		return this.root().locator('.sub-icon-static');
	}

	/**
	 * Signature state as the SPA renders it. The UI distinguishes only signed
	 * vs unsigned (it keys off a `-- ` line in the body, not real crypto), so a
	 * tampered/"broken" signature renders the same as unsigned — see
	 * `signatures.spec.ts`.
	 */
	async signatureState(): Promise<'signed' | 'unsigned'> {
		const cls = (await this.signatureIcon().getAttribute('class')) ?? '';
		return cls.includes('is-unsigned') ? 'unsigned' : 'signed';
	}

	/** Attachment chips shown in the reader. */
	attachments(): Locator {
		return this.root().locator('.mb-att');
	}

	async attachmentNames(): Promise<string[]> {
		return this.attachments().locator('.mb-att-name').allTextContents();
	}

	/** The mailing-list unsubscribe affordance (shown only for list mail). */
	unsubscribeButton(): Locator {
		return this.page.getByTestId('reader.unsubscribe-btn');
	}

	async close(): Promise<void> {
		await this.page.keyboard.press('Escape');
	}
}
