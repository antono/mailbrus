<script lang="ts">
	// openspec/changes/mailbrus-notmuch-database/specs/notmuch-database/spec.md
	// Persistent status bar: spinner while syncing/indexing, click for a popup
	// with per-account, per-mailbox fetched/indexed counts and error details.
	import {
		connectSyncStream,
		isActive,
		hasError,
		rowList,
		requestSync,
		type EventStatus
	} from '$lib/syncState.svelte.ts';

	let open = $state(false);
	let triggerError = $state<string | null>(null);

	$effect(() => connectSyncStream());

	let active = $derived(isActive());
	let errored = $derived(hasError());
	let rows = $derived(rowList());

	async function onSyncNow() {
		triggerError = null;
		try {
			await requestSync();
		} catch (e) {
			triggerError = e instanceof Error ? e.message : String(e);
		}
	}

	function badgeLabel(status: EventStatus | undefined): string {
		switch (status) {
			case 'running':
				return 'running';
			case 'done':
				return 'done';
			case 'error':
				return 'error';
			default:
				return '—';
		}
	}
</script>

<div class="mb-status" data-testid="status-bar.container">
	<button
		type="button"
		class="mb-status-toggle"
		class:is-active={active}
		class:is-error={errored}
		aria-label={active ? 'Syncing — show details' : 'Sync status'}
		aria-expanded={open}
		onclick={() => (open = !open)}
		data-testid="status-bar.toggle"
	>
		{#if active}
			<span
				class="mb-status-spinner"
				aria-hidden="true"
				data-testid="status-bar.spinner"
			></span>
			<span class="mb-status-text">Syncing…</span>
		{:else}
			<span
				class="mb-status-dot"
				class:is-error={errored}
				aria-hidden="true"
				data-testid="status-bar.idle"
			></span>
			<span class="mb-status-text">{errored ? 'Sync error' : 'Idle'}</span>
		{/if}
	</button>

	{#if open}
		<div class="mb-status-popup" role="dialog" aria-label="Sync status" data-testid="status-bar.popup">
			<div class="mb-status-popup-head">
				<span class="eyebrow">sync &amp; indexing</span>
				<button
					type="button"
					class="mb-status-sync"
					onclick={onSyncNow}
					disabled={active}
					data-testid="status-bar.sync-btn"
				>
					{active ? 'Syncing…' : 'Sync now'}
				</button>
				<button
					type="button"
					class="mb-status-close"
					onclick={() => (open = false)}
					aria-label="Close sync status"
					data-testid="status-bar.close-btn"
				>
					×
				</button>
			</div>
			{#if triggerError}
				<p class="mb-status-trigger-error" data-testid="status-bar.trigger-error">
					{triggerError}
				</p>
			{/if}
			<div class="mb-status-popup-body">
				{#if rows.length === 0}
					<p class="mb-status-empty" data-testid="status-bar.empty">No sync activity yet.</p>
				{:else}
					{#each rows as row (row.accountId + ' ' + (row.mailbox ?? ''))}
						<div
							class="mb-status-row"
							data-testid="status-bar.row"
							data-account={row.accountId}
							data-mailbox={row.mailbox ?? ''}
						>
							<div class="mb-status-row-head">
								<span class="mb-status-account">{row.accountId}</span>
								{#if row.mailbox}<span class="mb-status-mailbox">{row.mailbox}</span>{/if}
							</div>
							<div class="mb-status-counts">
								<span class="mb-status-count">fetched {row.fetched}</span>
								<span class="mb-status-count">indexed {row.indexed}</span>
								<span class="mb-status-badge" data-status={row.indexStatus ?? row.syncStatus ?? 'idle'}>
									{badgeLabel(row.indexStatus ?? row.syncStatus)}
								</span>
							</div>
							{#if row.error}
								<p class="mb-status-error" data-testid="status-bar.error">{row.error}</p>
							{/if}
						</div>
					{/each}
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.mb-status {
		position: fixed;
		right: 0.75rem;
		bottom: 0.75rem;
		z-index: 50;
		font-size: 0.8125rem;
	}
	.mb-status-toggle {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.3rem 0.6rem;
		border: 1px solid var(--border);
		border-radius: 999px;
		background: var(--card, var(--background));
		color: var(--foreground);
		cursor: pointer;
		box-shadow: 0 1px 3px rgb(0 0 0 / 0.12);
	}
	.mb-status-toggle.is-active {
		border-color: var(--brand-500, var(--accent));
	}
	.mb-status-toggle.is-error {
		border-color: var(--destructive);
	}
	.mb-status-text {
		opacity: 0.85;
	}
	.mb-status-spinner {
		width: 0.85rem;
		height: 0.85rem;
		border: 2px solid var(--border);
		border-top-color: var(--brand-500, var(--accent, currentColor));
		border-radius: 50%;
		animation: mb-status-spin 0.7s linear infinite;
	}
	.mb-status-dot {
		width: 0.6rem;
		height: 0.6rem;
		border-radius: 50%;
		background: var(--muted-foreground, currentColor);
		opacity: 0.5;
	}
	.mb-status-dot.is-error {
		background: var(--destructive);
		opacity: 1;
	}
	@keyframes mb-status-spin {
		to {
			transform: rotate(360deg);
		}
	}
	.mb-status-popup {
		position: absolute;
		right: 0;
		bottom: calc(100% + 0.5rem);
		width: min(20rem, 80vw);
		max-height: 60vh;
		overflow: auto;
		background: var(--card, var(--background));
		color: var(--foreground);
		border: 1px solid var(--border);
		border-radius: 0.6rem;
		box-shadow: 0 6px 24px rgb(0 0 0 / 0.18);
	}
	.mb-status-popup-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 0.75rem;
		border-bottom: 1px solid var(--border);
	}
	.mb-status-sync {
		margin-left: auto;
		margin-right: 0.5rem;
		padding: 0.15rem 0.55rem;
		border: 1px solid var(--border);
		border-radius: 999px;
		background: var(--background);
		color: var(--foreground);
		font-size: 0.75rem;
		cursor: pointer;
	}
	.mb-status-sync:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.mb-status-close {
		background: none;
		border: none;
		color: inherit;
		font-size: 1.1rem;
		line-height: 1;
		cursor: pointer;
	}
	.mb-status-trigger-error {
		padding: 0.4rem 0.75rem;
		color: var(--destructive);
		font-size: 0.75rem;
		border-bottom: 1px solid var(--border);
	}
	.mb-status-popup-body {
		padding: 0.4rem 0.25rem;
	}
	.mb-status-empty {
		padding: 0.5rem 0.75rem;
		opacity: 0.7;
	}
	.mb-status-row {
		padding: 0.45rem 0.75rem;
		border-bottom: 1px solid var(--border);
	}
	.mb-status-row:last-child {
		border-bottom: none;
	}
	.mb-status-row-head {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
	}
	.mb-status-account {
		font-weight: 600;
	}
	.mb-status-mailbox {
		opacity: 0.7;
	}
	.mb-status-counts {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.2rem;
		opacity: 0.85;
	}
	.mb-status-badge {
		margin-left: auto;
		padding: 0.05rem 0.4rem;
		border-radius: 999px;
		border: 1px solid var(--border);
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.02em;
	}
	.mb-status-badge[data-status='running'] {
		border-color: var(--brand-500, var(--accent));
		color: var(--brand-700, var(--accent));
	}
	.mb-status-badge[data-status='error'] {
		border-color: var(--destructive);
		color: var(--destructive);
	}
	.mb-status-error {
		margin-top: 0.3rem;
		color: var(--destructive);
		font-size: 0.75rem;
	}
</style>
