<script lang="ts">
	// openspec/changes/accounts-dialog/specs/onboarding-wizard/spec.md
	import { createAccount, triggerSync } from '$lib/api.js';
	import type { AccountSummary, CreateAccountPayload, CredentialBackend } from '$lib/api.js';

	let { onAccountReady }: { onAccountReady: (account: AccountSummary) => void } = $props();

	// ── well-known provider presets ───────────────────────────────────────────
	interface Provider {
		id: string;
		label: string;
		imap_host: string;
		imap_port: number;
		imap_tls: boolean;
		smtp_host: string;
		smtp_port: number;
		smtp_starttls: boolean;
		note: string | null;
	}

	const PROVIDERS: Provider[] = [
		{
			id: 'gmail',
			label: 'Gmail',
			imap_host: 'imap.gmail.com',
			imap_port: 993,
			imap_tls: true,
			smtp_host: 'smtp.gmail.com',
			smtp_port: 587,
			smtp_starttls: true,
			note: 'Gmail requires an App Password when 2-Step Verification is enabled. Regular passwords will not work.'
		},
		{
			id: 'outlook',
			label: 'Outlook / Hotmail',
			imap_host: 'outlook.office365.com',
			imap_port: 993,
			imap_tls: true,
			smtp_host: 'smtp-mail.outlook.com',
			smtp_port: 587,
			smtp_starttls: true,
			note: null
		},
		{
			id: 'yahoo',
			label: 'Yahoo Mail',
			imap_host: 'imap.mail.yahoo.com',
			imap_port: 993,
			imap_tls: true,
			smtp_host: 'smtp.mail.yahoo.com',
			smtp_port: 587,
			smtp_starttls: true,
			note: 'Yahoo requires an App Password. Generate one at Security → Manage app passwords.'
		},
		{
			id: 'icloud',
			label: 'iCloud Mail',
			imap_host: 'imap.mail.me.com',
			imap_port: 993,
			imap_tls: true,
			smtp_host: 'smtp.mail.me.com',
			smtp_port: 587,
			smtp_starttls: true,
			note: 'iCloud requires an app-specific password. Generate one at appleid.apple.com → Sign-In and Security.'
		},
		{
			id: 'fastmail',
			label: 'Fastmail',
			imap_host: 'imap.fastmail.com',
			imap_port: 993,
			imap_tls: true,
			smtp_host: 'smtp.fastmail.com',
			smtp_port: 587,
			smtp_starttls: true,
			note: null
		}
	];

	let selectedProvider = $state<string>('custom');
	const preset = $derived(PROVIDERS.find((p) => p.id === selectedProvider) ?? null);
	let showAdvanced = $state(false);

	$effect(() => {
		if (preset) {
			imapHost = preset.imap_host;
			imapPort = preset.imap_port;
			imapTls = preset.imap_tls;
			smtpHost = preset.smtp_host;
			smtpPort = preset.smtp_port;
			smtpStarttls = preset.smtp_starttls;
			showAdvanced = false;
		}
	});

	// ── form state ────────────────────────────────────────────────────────────
	let email = $state('');
	let displayName = $state('');
	let imapHost = $state('');
	let imapPort = $state(993);
	let imapTls = $state(true);
	let smtpHost = $state('');
	let smtpPort = $state(587);
	let smtpStarttls = $state(true);
	let credentialBackend = $state<CredentialBackend>('keyring');
	let secret = $state('');
	let signature = $state('');

	// ── wizard phase ──────────────────────────────────────────────────────────
	type Phase = 'form' | 'created';
	let phase = $state<Phase>('form');
	let createdAccount = $state<AccountSummary | null>(null);

	// ── form submission ───────────────────────────────────────────────────────
	let submitting = $state(false);
	let fieldErrors = $state<Record<string, string>>({});
	let formError = $state('');

	async function handleSubmit(e: Event) {
		e.preventDefault();
		if (submitting) return;
		submitting = true;
		fieldErrors = {};
		formError = '';

		const payload: CreateAccountPayload = {
			email: email.trim(),
			display_name: displayName.trim() || undefined,
			imap_host: imapHost.trim(),
			imap_port: imapPort,
			imap_tls: imapTls,
			smtp_host: smtpHost.trim() || undefined,
			smtp_port: smtpPort,
			smtp_starttls: smtpStarttls,
			credential_backend: credentialBackend,
			secret,
			signature: signature.trim() || undefined
		};

		try {
			const created = await createAccount(payload);
			createdAccount = created;
			phase = 'created';
		} catch (err: unknown) {
			const e = err as { message: string; field?: string; status?: number };
			if (e.field) {
				fieldErrors = { [e.field]: e.message };
			} else if (e.status === 409) {
				fieldErrors = { email: 'An account with this email address already exists.' };
			} else {
				formError = e.message ?? 'Unknown error';
			}
		} finally {
			submitting = false;
		}
	}

	// ── post-create sync ──────────────────────────────────────────────────────
	let syncing = $state(false);
	let syncDone = $state(false);
	let syncError = $state('');

	async function handleSyncNow() {
		if (!createdAccount || syncing) return;
		syncing = true;
		syncError = '';
		try {
			await triggerSync(createdAccount.id);
			// Poll /api/maildirs until at least one maildir appears for this account.
			await pollForFirstMessage(createdAccount.id);
			syncDone = true;
		} catch (err: unknown) {
			syncError = (err as Error).message ?? 'Sync failed';
		} finally {
			syncing = false;
		}
	}

	async function pollForFirstMessage(accountId: string): Promise<void> {
		const MAX_POLLS = 60;
		for (let i = 0; i < MAX_POLLS; i++) {
			await new Promise((r) => setTimeout(r, 2000));
			try {
				const res = await fetch('/api/maildirs');
				if (!res.ok) continue;
				const maildirs = await res.json() as Array<{ id: string; total: number }>;
				const acc = maildirs.find((m) => m.id === accountId);
				if (acc && acc.total > 0) return;
			} catch {
				// keep polling
			}
		}
	}

	function handleGoToInbox() {
		if (createdAccount) onAccountReady(createdAccount);
	}
</script>

<div class="onboarding-wizard" data-testid="onboarding-wizard">
	{#if phase === 'form'}
		<div class="onboarding-header">
			<h1 data-testid="onboarding-wizard.title">Welcome to Mailbrus</h1>
			<p>Add your first email account to get started.</p>
		</div>

		<form class="onboarding-form" onsubmit={handleSubmit} data-testid="onboarding-wizard.form">
			<!-- ── Provider selector ───────────────────────────────────────── -->
			<fieldset class="form-section">
				<legend>Email provider</legend>

				<label class="form-row">
					<span class="form-label">Provider</span>
					<select
						class="form-input form-select"
						data-testid="onboarding-wizard.provider"
						bind:value={selectedProvider}
					>
						<option value="custom">Custom (manual setup)</option>
						{#each PROVIDERS as p}
							<option value={p.id}>{p.label}</option>
						{/each}
					</select>
				</label>

				{#if preset?.note}
					<p class="provider-note" data-testid="onboarding-wizard.provider-note">
						{preset.note}
					</p>
				{/if}
			</fieldset>

			<!-- ── Account ────────────────────────────────────────────────── -->
			<fieldset class="form-section">
				<legend>Account</legend>

				<label class="form-row">
					<span class="form-label">Email address</span>
					<input
						type="email"
						class="form-input"
						data-testid="onboarding-wizard.email"
						bind:value={email}
						required
						autocomplete="email"
					/>
					{#if fieldErrors.email}
						<span class="field-error" data-testid="onboarding-wizard.email-error">{fieldErrors.email}</span>
					{/if}
				</label>

				<label class="form-row">
					<span class="form-label">Display name <span class="optional">(optional)</span></span>
					<input
						type="text"
						class="form-input"
						data-testid="onboarding-wizard.display-name"
						bind:value={displayName}
						autocomplete="name"
					/>
				</label>
			</fieldset>

			<!-- ── Credentials ────────────────────────────────────────────── -->
			<fieldset class="form-section">
				<legend>Credentials</legend>

				<label class="form-row">
					<span class="form-label">Password</span>
					<input
						type="password"
						class="form-input"
						data-testid="onboarding-wizard.secret"
						bind:value={secret}
						required
						autocomplete="current-password"
					/>
				</label>

				<div class="form-row">
					<span class="form-label">Storage</span>
					<div class="form-radio-group" data-testid="onboarding-wizard.credential-backend">
						<label class="form-radio">
							<input
								type="radio"
								name="credential_backend"
								value="keyring"
								bind:group={credentialBackend}
								data-testid="onboarding-wizard.credential-keyring"
							/>
							<span>Keyring <span class="optional">(recommended)</span></span>
						</label>
						<label class="form-radio">
							<input
								type="radio"
								name="credential_backend"
								value="plain"
								bind:group={credentialBackend}
								data-testid="onboarding-wizard.credential-plain"
							/>
							<span>Plain text</span>
						</label>
					</div>
					{#if credentialBackend === 'plain'}
						<p class="plain-warning" data-testid="onboarding-wizard.plain-warning">
							⚠ Your password will be stored in plain text in the config file.
						</p>
					{/if}
				</div>
			</fieldset>

			<!-- ── Advanced toggle (preset mode only) ─────────────────────── -->
			{#if preset}
				<button
					type="button"
					class="advanced-toggle"
					data-testid="onboarding-wizard.advanced-toggle"
					onclick={() => (showAdvanced = !showAdvanced)}
				>
					{showAdvanced ? '▲ Hide server settings' : '▾ Show server settings'}
					<span class="advanced-toggle-hint"
						>({preset.imap_host} · port {preset.imap_port})</span
					>
				</button>
			{/if}

			<!-- ── IMAP / SMTP / Signature (always for custom, toggled for preset) ── -->
			{#if !preset || showAdvanced}
				<fieldset class="form-section">
					<legend>IMAP (incoming mail)</legend>

					<label class="form-row">
						<span class="form-label">Host</span>
						<input
							type="text"
							class="form-input"
							data-testid="onboarding-wizard.imap-host"
							bind:value={imapHost}
							required
							placeholder="imap.example.com"
						/>
						{#if fieldErrors.imap_host}
							<span class="field-error" data-testid="onboarding-wizard.imap-host-error">{fieldErrors.imap_host}</span>
						{/if}
					</label>

					<div class="form-row form-row-inline">
						<label class="form-row-part">
							<span class="form-label">Port</span>
							<input
								type="number"
								class="form-input form-input-short"
								data-testid="onboarding-wizard.imap-port"
								bind:value={imapPort}
								min="1"
								max="65535"
								required
							/>
						</label>
						<label class="form-row-part form-row-checkbox">
							<input
								type="checkbox"
								data-testid="onboarding-wizard.imap-tls"
								bind:checked={imapTls}
							/>
							<span>TLS</span>
						</label>
					</div>
				</fieldset>

				<fieldset class="form-section">
					<legend>SMTP (outgoing mail)</legend>

					<label class="form-row">
						<span class="form-label">Host <span class="optional">(optional)</span></span>
						<input
							type="text"
							class="form-input"
							data-testid="onboarding-wizard.smtp-host"
							bind:value={smtpHost}
							placeholder="smtp.example.com"
						/>
						{#if fieldErrors.smtp_host}
							<span class="field-error" data-testid="onboarding-wizard.smtp-host-error">{fieldErrors.smtp_host}</span>
						{/if}
					</label>

					<div class="form-row form-row-inline">
						<label class="form-row-part">
							<span class="form-label">Port</span>
							<input
								type="number"
								class="form-input form-input-short"
								data-testid="onboarding-wizard.smtp-port"
								bind:value={smtpPort}
								min="1"
								max="65535"
							/>
						</label>
						<label class="form-row-part form-row-checkbox">
							<input
								type="checkbox"
								data-testid="onboarding-wizard.smtp-starttls"
								bind:checked={smtpStarttls}
							/>
							<span>STARTTLS</span>
						</label>
					</div>
				</fieldset>

				<fieldset class="form-section">
					<legend>Signature <span class="optional">(optional)</span></legend>

					<label class="form-row">
						<span class="form-label">Footer text</span>
						<textarea
							class="form-input form-input-textarea"
							data-testid="onboarding-wizard.signature"
							bind:value={signature}
							placeholder="Best regards,&#10;Your Name"
							rows="4"
						></textarea>
					</label>
				</fieldset>
			{/if}

			{#if formError}
				<p class="form-error" data-testid="onboarding-wizard.form-error">{formError}</p>
			{/if}

			<div class="form-actions">
				<button
					type="submit"
					class="btn btn-primary"
					data-testid="onboarding-wizard.submit"
					disabled={submitting}
				>
					{submitting ? 'Connecting…' : 'Add account'}
				</button>
			</div>
		</form>

	{:else if phase === 'created'}
		<div class="onboarding-created" data-testid="onboarding-wizard.created">
			<h1>Account added</h1>
			<p>
				<strong>{createdAccount?.email}</strong> is configured. Sync to download your messages.
			</p>

			{#if syncError}
				<p class="form-error" data-testid="onboarding-wizard.sync-error">{syncError}</p>
			{/if}

			{#if !syncDone}
				<button
					type="button"
					class="btn btn-primary"
					data-testid="onboarding-wizard.sync-now"
					onclick={handleSyncNow}
					disabled={syncing}
				>
					{syncing ? 'Syncing…' : 'Sync now'}
				</button>
			{/if}

			{#if syncDone}
				<button
					type="button"
					class="btn btn-primary"
					data-testid="onboarding-wizard.go-to-inbox"
					onclick={handleGoToInbox}
				>
					Go to inbox
				</button>
			{/if}
		</div>
	{/if}
</div>

<style>
	.onboarding-wizard {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		padding: 2rem;
		background: var(--bg, #fff);
		color: var(--fg, #000);
	}

	.onboarding-header,
	.onboarding-created {
		text-align: center;
		margin-bottom: 2rem;
	}

	.onboarding-header h1,
	.onboarding-created h1 {
		font-size: 1.75rem;
		font-weight: 700;
		margin: 0 0 0.5rem;
	}

	.onboarding-form {
		width: 100%;
		max-width: 480px;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.form-section {
		border: 1px solid var(--border, #ddd);
		border-radius: 6px;
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	legend {
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: 0 0.25rem;
		color: var(--fg-muted, #666);
	}

	.form-row {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.form-row-inline {
		flex-direction: row;
		align-items: flex-end;
		gap: 1rem;
	}

	.form-row-part {
		flex: 1;
	}

	.form-row-checkbox {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 0.4rem;
		flex: 0 0 auto;
		padding-bottom: 0.25rem;
	}

	.form-label {
		font-size: 0.875rem;
		font-weight: 500;
	}

	.optional {
		font-weight: 400;
		color: var(--fg-muted, #666);
		font-size: 0.8em;
	}

	.form-input {
		width: 100%;
		padding: 0.4rem 0.6rem;
		border: 1px solid var(--border, #ddd);
		border-radius: 4px;
		font-size: 0.9rem;
		background: var(--input-bg, #fff);
		color: var(--fg, #000);
		box-sizing: border-box;
	}

	.form-input-short {
		width: 80px;
	}

	.form-input-textarea {
		resize: vertical;
		font-family: inherit;
		min-height: 80px;
	}

	.form-radio-group {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.form-radio {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		cursor: pointer;
		font-size: 0.9rem;
	}

	.plain-warning {
		margin: 0.25rem 0 0;
		padding: 0.5rem 0.75rem;
		background: #fff8e1;
		border: 1px solid #ffe082;
		border-radius: 4px;
		font-size: 0.85rem;
		color: #795548;
	}

	.field-error {
		font-size: 0.8rem;
		color: #d32f2f;
	}

	.form-error {
		padding: 0.5rem 0.75rem;
		background: #ffebee;
		border: 1px solid #ef9a9a;
		border-radius: 4px;
		font-size: 0.875rem;
		color: #c62828;
		margin: 0;
	}

	.form-actions {
		display: flex;
		justify-content: flex-end;
	}

	.btn {
		padding: 0.5rem 1.25rem;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		font-size: 0.9rem;
		font-weight: 500;
	}

	.btn-primary {
		background: var(--brand, #4f46e5);
		color: var(--brand-foreground, #fff);
	}

	.btn-primary:hover:not(:disabled) {
		background: var(--brand-600, #4338ca);
	}

	.btn-primary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.form-select {
		appearance: none;
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23666' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
		background-repeat: no-repeat;
		background-position: right 0.6rem center;
		padding-right: 2rem;
		cursor: pointer;
	}

	.provider-note {
		margin: 0;
		padding: 0.5rem 0.75rem;
		background: color-mix(in oklch, var(--brand, #4f46e5) 8%, transparent);
		border: 1px solid color-mix(in oklch, var(--brand, #4f46e5) 25%, transparent);
		border-radius: 4px;
		font-size: 0.85rem;
		color: var(--fg, #000);
		line-height: 1.45;
	}

	.advanced-toggle {
		all: unset;
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.875rem;
		color: var(--brand, #4f46e5);
		cursor: pointer;
		padding: 0.25rem 0;
	}

	.advanced-toggle:hover {
		text-decoration: underline;
	}

	.advanced-toggle-hint {
		font-size: 0.8rem;
		color: var(--fg-muted, #666);
		font-weight: 400;
	}
</style>
