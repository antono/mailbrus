// openspec/changes/accounts-dialog/specs/onboarding-wizard/spec.md
import { expect, type Page } from '@playwright/test';

export interface AccountFormFields {
	email: string;
	imapHost: string;
	imapPort?: number;
	imapTls?: boolean;
	secret: string;
	displayName?: string;
	smtpHost?: string;
}

export class OnboardingPage {
	constructor(private readonly page: Page) {}

	/** Navigate to '/' and assert the wizard is shown (not the mailbox). */
	async open(): Promise<void> {
		await this.page.goto('/');
		await expect(this.page.getByTestId('onboarding-wizard')).toBeVisible();
	}

	/** Assert wizard is visible without navigating. */
	async expectVisible(): Promise<void> {
		await expect(this.page.getByTestId('onboarding-wizard')).toBeVisible();
	}

	/** Assert wizard is gone (mailbox has taken over). */
	async expectDismissed(): Promise<void> {
		await expect(this.page.getByTestId('onboarding-wizard')).not.toBeVisible({ timeout: 10_000 });
	}

	/** Fill the required form fields. */
	async fillForm(fields: AccountFormFields): Promise<void> {
		await this.page.getByTestId('onboarding-wizard.email').fill(fields.email);
		await this.page.getByTestId('onboarding-wizard.imap-host').fill(fields.imapHost);
		if (fields.imapPort !== undefined) {
			await this.page.getByTestId('onboarding-wizard.imap-port').fill(String(fields.imapPort));
		}
		if (fields.imapTls !== undefined) {
			const checkbox = this.page.getByTestId('onboarding-wizard.imap-tls');
			const checked = await checkbox.isChecked();
			if (checked !== fields.imapTls) await checkbox.click();
		}
		await this.page.getByTestId('onboarding-wizard.secret').fill(fields.secret);
		if (fields.displayName) {
			await this.page.getByTestId('onboarding-wizard.display-name').fill(fields.displayName);
		}
		if (fields.smtpHost) {
			await this.page.getByTestId('onboarding-wizard.smtp-host').fill(fields.smtpHost);
		}
	}

	/** Click the submit button. */
	async submit(): Promise<void> {
		await this.page.getByTestId('onboarding-wizard.submit').click();
	}

	/** Wait for "Account added" success phase. */
	async expectCreated(): Promise<void> {
		await expect(this.page.getByTestId('onboarding-wizard.created')).toBeVisible({ timeout: 20_000 });
	}

	/** Click "Sync now" and wait until it transitions to "Go to inbox". */
	async syncNow(): Promise<void> {
		await this.page.getByTestId('onboarding-wizard.sync-now').click();
		await expect(this.page.getByTestId('onboarding-wizard.go-to-inbox')).toBeVisible({ timeout: 30_000 });
	}

	/** Click "Go to inbox" — triggers onAccountReady and dismisses the wizard. */
	async goToInbox(): Promise<void> {
		await this.page.getByTestId('onboarding-wizard.go-to-inbox').click();
	}

	/** Field-level validation error for a given field id (e.g. 'email', 'imap-host'). */
	async fieldError(field: string): Promise<string | null> {
		const locator = this.page.getByTestId(`onboarding-wizard.${field}-error`);
		const visible = await locator.isVisible();
		return visible ? (await locator.textContent()) ?? null : null;
	}

	/** Form-level (non-field) error. */
	async formError(): Promise<string | null> {
		const locator = this.page.getByTestId('onboarding-wizard.form-error');
		const visible = await locator.isVisible();
		return visible ? (await locator.textContent()) ?? null : null;
	}
}
