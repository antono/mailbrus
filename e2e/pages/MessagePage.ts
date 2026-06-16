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

	// ── Rendering mode controls ─────────────────────────────────────────────────

	modeTextBtn(): Locator {
		return this.page.getByTestId('reader.mode-text');
	}

	modeSimpleBtn(): Locator {
		return this.page.getByTestId('reader.mode-simple');
	}

	modeHtmlBtn(): Locator {
		return this.page.getByTestId('reader.mode-html');
	}

	/** The sandboxed srcdoc iframe (visible only in HTML mode). */
	htmlIframe(): Locator {
		return this.page.getByTestId('reader.html-iframe');
	}

	/** Banner warning that this message contains remote resources. */
	remoteBanner(): Locator {
		return this.page.getByTestId('reader.remote-banner');
	}

	/** The "Load" button inside the remote-content banner. */
	loadRemoteBtn(): Locator {
		return this.page.getByTestId('reader.load-remote');
	}

	/** Current rendering mode derived from aria-pressed state. */
	async activeMode(): Promise<'text' | 'simple' | 'html' | null> {
		for (const m of ['text', 'simple', 'html'] as const) {
			const pressed = await this.page.getByTestId(`reader.mode-${m}`).getAttribute('aria-pressed');
			if (pressed === 'true') return m;
		}
		return null;
	}

	async close(): Promise<void> {
		await this.page.keyboard.press('Escape');
	}

	// ── Folder-position counter ─────────────────────────────────────────────────

	/** Absolute message index number in the breadcrumb counter. */
	counterIndex(): Locator {
		return this.page.getByTestId('reader.counter-index');
	}

	/** Current page number in the breadcrumb counter. */
	counterPage(): Locator {
		return this.page.getByTestId('reader.counter-page');
	}

	/** Folder total in the breadcrumb counter. */
	counterTotal(): Locator {
		return this.page.getByTestId('reader.counter-total');
	}

	// ── Keyboard navigation ─────────────────────────────────────────────────────

	/** `j` — next message (crosses to the next page at the page edge). */
	async next(): Promise<void> {
		await this.page.keyboard.press('j');
	}

	/** `k` — previous message (crosses to the previous page at the page edge). */
	async prev(): Promise<void> {
		await this.page.keyboard.press('k');
	}

	/** `q` — quit to the list, focused on the current message. */
	async quit(): Promise<void> {
		await this.page.keyboard.press('q');
	}
}
