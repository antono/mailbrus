/** Page object for the compose screen (incl. reply/forward prefill). */
import { expect, type Locator, type Page } from '@playwright/test';

export class ComposePage {
	constructor(private readonly page: Page) {}

	container(): Locator {
		return this.page.getByTestId('compose.container');
	}

	/** Wait for the compose screen to be visible. */
	async waitVisible(): Promise<void> {
		await expect(this.container()).toBeVisible();
	}

	toInput(): Locator {
		return this.page.getByTestId('compose.to-input');
	}

	ccInput(): Locator {
		return this.page.getByTestId('compose.cc-input');
	}

	subjectInput(): Locator {
		return this.page.getByTestId('compose.subject-input');
	}

	body(): Locator {
		return this.page.getByTestId('compose.body');
	}

	async toValue(): Promise<string> {
		return (await this.toInput().inputValue()) ?? '';
	}

	async ccValue(): Promise<string> {
		return (await this.ccInput().inputValue()) ?? '';
	}

	async subjectValue(): Promise<string> {
		return (await this.subjectInput().inputValue()) ?? '';
	}

	async bodyValue(): Promise<string> {
		return (await this.body().inputValue()) ?? '';
	}
}
