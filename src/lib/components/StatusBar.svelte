<script lang="ts">
	// openspec/changes/sync-status-bar-redesign/specs/sync-status-compact-ui/spec.md
	// openspec/changes/sync-status-bar-redesign/specs/sync-event-log/spec.md
	//
	// Compact, progressively-disclosed sync status: an idle dot morphs to a
	// "Sync now" button on click, the button starts a sync and morphs to a
	// spinner, and clicking the spinner opens a timestamped event-log popup.
	import {
		connectSyncStream,
		isActive,
		hasError,
		requestSync
	} from '$lib/syncState.svelte.ts';
	import {
		currentRunEvents,
		historyRuns,
		clearEvents,
		type SyncLogEvent
	} from '$lib/syncEventLog.svelte.ts';

	/** How many of the latest current-run events the popup shows before scrolling. */
	const VISIBLE_EVENTS = 15;

	// Local morph state. The spinner is derived from live sync activity, so this
	// only tracks the idle↔button intermediate (tasks 3.1–3.2).
	let uiState = $state<'idle' | 'button'>('idle');
	let open = $state(false);
	let triggerError = $state<string | null>(null);
	let expandedRuns = $state<Set<number>>(new Set());

	$effect(() => {
		connectSyncStream();
	});

	const active = $derived(isActive());
	const errored = $derived(hasError());

	// Reset the morph back to the idle dot the moment a sync finishes (task 3.5),
	// without collapsing a button the user opened while idle. Tracked via a plain
	// (non-reactive) flag so this effect only depends on `active` — no feedback loop.
	let wasActive = false;
	$effect(() => {
		if (wasActive && !active) uiState = 'idle';
		wasActive = active;
	});

	// Newest-first current-run events, plus the count hidden beyond the visible cap.
	const runEvents = $derived(currentRunEvents().slice().reverse());
	const visibleEvents = $derived(runEvents.slice(0, VISIBLE_EVENTS));
	const moreCount = $derived(Math.max(0, runEvents.length - VISIBLE_EVENTS));
	const runs = $derived(historyRuns());

	function formatTime(iso: string): string {
		const d = new Date(iso);
		return d.toLocaleTimeString(undefined, { hour12: false });
	}

	/** Human-readable one-liner: `[HH:MM:SS] account: event (detail)`. */
	function formatEvent(e: SyncLogEvent): string {
		const base = `[${formatTime(e.timestamp)}] ${e.account}: ${e.event}`;
		return e.detail ? `${base} (${e.detail})` : base;
	}

	function onDotClick() {
		uiState = 'button';
	}

	async function onButtonClick() {
		triggerError = null;
		try {
			await requestSync();
		} catch (e) {
			triggerError = e instanceof Error ? e.message : String(e);
		}
	}

	function onSpinnerClick() {
		open = true;
	}

	function toggleRun(i: number) {
		const next = new Set(expandedRuns);
		if (next.has(i)) next.delete(i);
		else next.add(i);
		expandedRuns = next;
	}

	async function onCopyLog() {
		const text = visibleEvents.map(formatEvent).join('\n');
		try {
			await navigator.clipboard.writeText(text);
		} catch {
			// Clipboard may be unavailable (insecure context); ignore silently.
		}
	}

	function onClearHistory() {
		if (typeof confirm === 'function' && !confirm('Clear all sync history? This cannot be undone.')) {
			return;
		}
		clearEvents();
		expandedRuns = new Set();
	}
</script>

<div class="mb-status" data-testid="status-bar.container">
	<!-- Morphing control: idle dot → "Sync now" button → spinner -->
	{#if active}
		<button
			type="button"
			class="mb-status-control is-spinner"
			aria-label="Syncing — show event log"
			onclick={onSpinnerClick}
			data-testid="status-bar.spinner"
		>
			<span class="mb-status-spinner" aria-hidden="true"></span>
		</button>
	{:else if uiState === 'button'}
		<button
			type="button"
			class="mb-status-control is-button"
			onclick={onButtonClick}
			data-testid="status-bar.sync-btn"
		>
			Sync now
		</button>
	{:else}
		<button
			type="button"
			class="mb-status-control is-dot"
			class:is-error={errored}
			aria-label={errored ? 'Sync error — click to retry' : 'Sync status'}
			onclick={onDotClick}
			data-testid="status-bar.idle"
		>
			<span class="mb-status-dot" class:is-error={errored} aria-hidden="true"></span>
		</button>
	{/if}

	{#if triggerError}
		<p class="mb-status-trigger-error" data-testid="status-bar.trigger-error">{triggerError}</p>
	{/if}

	{#if open}
		<div class="mb-status-popup" role="dialog" aria-label="Sync event log" data-testid="status-bar.popup">
			<div class="mb-status-popup-head">
				<span class="eyebrow">sync log</span>
				<button
					type="button"
					class="mb-status-action"
					onclick={onCopyLog}
					data-testid="status-bar.copy-log"
				>
					Copy log
				</button>
				<button
					type="button"
					class="mb-status-close"
					onclick={() => (open = false)}
					aria-label="Close sync log"
					data-testid="status-bar.close-btn"
				>
					×
				</button>
			</div>

			<div class="mb-status-events" data-testid="status-bar.events">
				{#if visibleEvents.length === 0}
					<p class="mb-status-empty" data-testid="status-bar.empty">No events yet.</p>
				{:else}
					{#each visibleEvents as e (e.timestamp + e.event + e.account)}
						<div class="mb-status-event" data-testid="status-bar.event-row" data-event={e.event}>
							<span class="mb-status-event-time">{formatTime(e.timestamp)}</span>
							<span class="mb-status-event-account">{e.account}</span>
							<span class="mb-status-event-type" data-event={e.event}>{e.event}</span>
							{#if e.detail}<span class="mb-status-event-detail">{e.detail}</span>{/if}
						</div>
					{/each}
					{#if moreCount > 0}
						<p class="mb-status-more" data-testid="status-bar.more-events">
							{moreCount} more event{moreCount !== 1 ? 's' : ''} in this run
						</p>
					{/if}
				{/if}
			</div>

			{#if runs.length > 0}
				<div class="mb-status-history" data-testid="status-bar.history">
					<div class="mb-status-history-head">
						<span class="mb-status-history-title">History</span>
						<button
							type="button"
							class="mb-status-action"
							onclick={onClearHistory}
							data-testid="status-bar.clear-history"
						>
							Clear history
						</button>
					</div>
					{#each runs as run, i (run.finishedAt + i)}
						<div class="mb-status-run" data-testid="status-bar.history-run">
							<button type="button" class="mb-status-run-toggle" onclick={() => toggleRun(i)}>
								<span class="mb-status-run-time">{formatTime(run.finishedAt)}</span>
								<span class="mb-status-run-summary">{run.summary}</span>
							</button>
							{#if expandedRuns.has(i)}
								<div class="mb-status-run-events">
									{#each run.events.slice().reverse() as e (e.timestamp + e.event + e.account)}
										<div class="mb-status-event" data-event={e.event}>
											<span class="mb-status-event-time">{formatTime(e.timestamp)}</span>
											<span class="mb-status-event-account">{e.account}</span>
											<span class="mb-status-event-type">{e.event}</span>
											{#if e.detail}<span class="mb-status-event-detail">{e.detail}</span>{/if}
										</div>
									{/each}
								</div>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
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
	/* Shared morph target: width/padding/opacity transition between states. */
	.mb-status-control {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: 1px solid transparent;
		background: var(--card, var(--background));
		color: var(--foreground);
		cursor: pointer;
		border-radius: 999px;
		transition:
			width 0.3s ease,
			padding 0.3s ease,
			background 0.3s ease,
			border-color 0.3s ease,
			opacity 0.3s ease;
	}
	/* Idle: minimal ~20px footprint holding a ~6px dot. */
	.mb-status-control.is-dot {
		width: 1.25rem;
		height: 1.25rem;
		padding: 0;
		border-color: var(--border);
		box-shadow: 0 1px 3px rgb(0 0 0 / 0.12);
	}
	.mb-status-control.is-dot.is-error {
		border-color: var(--destructive);
	}
	.mb-status-dot {
		width: 0.6rem;
		height: 0.6rem;
		border-radius: 50%;
		background: var(--muted-foreground, currentColor);
		opacity: 0.55;
	}
	.mb-status-dot.is-error {
		background: var(--destructive);
		opacity: 1;
	}
	/* Button: "Sync now", auto width capped under 100px. */
	.mb-status-control.is-button {
		max-width: 100px;
		padding: 0.3rem 0.7rem;
		border-color: var(--brand-500, var(--accent, var(--border)));
		box-shadow: 0 1px 3px rgb(0 0 0 / 0.12);
		font-size: 0.75rem;
	}
	/* Spinner: rotating ring, same footprint as the dot. */
	.mb-status-control.is-spinner {
		width: 1.5rem;
		height: 1.5rem;
		padding: 0;
		border-color: var(--brand-500, var(--accent));
		box-shadow: 0 1px 3px rgb(0 0 0 / 0.12);
	}
	.mb-status-spinner {
		width: 0.85rem;
		height: 0.85rem;
		border: 2px solid var(--border);
		border-top-color: var(--brand-500, var(--accent, currentColor));
		border-radius: 50%;
		animation: mb-status-spin 0.7s linear infinite;
	}
	@keyframes mb-status-spin {
		to {
			transform: rotate(360deg);
		}
	}
	.mb-status-trigger-error {
		position: absolute;
		right: 0;
		bottom: calc(100% + 0.4rem);
		max-width: 16rem;
		padding: 0.35rem 0.6rem;
		background: var(--card, var(--background));
		border: 1px solid var(--destructive);
		border-radius: 0.4rem;
		color: var(--destructive);
		font-size: 0.75rem;
	}
	/* Popup below-ish the control (anchored to the fixed corner), above other UI. */
	.mb-status-popup {
		position: absolute;
		right: 0;
		bottom: calc(100% + 0.5rem);
		width: min(22rem, 80vw);
		background: var(--card, var(--background));
		color: var(--foreground);
		border: 1px solid var(--border);
		border-radius: 0.6rem;
		box-shadow: 0 6px 24px rgb(0 0 0 / 0.18);
		z-index: 50;
		animation: mb-status-slide 0.2s ease;
	}
	@keyframes mb-status-slide {
		from {
			opacity: 0;
			transform: translateY(0.4rem);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
	.mb-status-popup-head {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		border-bottom: 1px solid var(--border);
	}
	.eyebrow {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		opacity: 0.6;
	}
	.mb-status-action {
		margin-left: auto;
		padding: 0.1rem 0.45rem;
		border: 1px solid var(--border);
		border-radius: 999px;
		background: var(--background);
		color: var(--foreground);
		font-size: 0.7rem;
		cursor: pointer;
	}
	.mb-status-history-head .mb-status-action {
		color: var(--muted-foreground);
	}
	.mb-status-history-head .mb-status-action:hover {
		color: var(--destructive);
		border-color: var(--destructive);
	}
	.mb-status-close {
		background: none;
		border: none;
		color: inherit;
		font-size: 1.1rem;
		line-height: 1;
		cursor: pointer;
		margin-left: 0;
	}
	.mb-status-events {
		max-height: 200px;
		overflow-y: auto;
		padding: 0.35rem 0.25rem;
		font-variant-numeric: tabular-nums;
	}
	.mb-status-empty {
		padding: 0.5rem 0.75rem;
		opacity: 0.7;
	}
	.mb-status-event {
		display: flex;
		align-items: baseline;
		gap: 0.45rem;
		padding: 0.18rem 0.5rem;
		font-size: 0.75rem;
		white-space: nowrap;
	}
	.mb-status-event-time {
		opacity: 0.6;
		font-variant-numeric: tabular-nums;
	}
	.mb-status-event-account {
		opacity: 0.75;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 9rem;
	}
	.mb-status-event-type {
		font-weight: 600;
	}
	.mb-status-event-type[data-event='sync_failed'] {
		color: var(--destructive);
	}
	.mb-status-event-detail {
		opacity: 0.6;
	}
	.mb-status-more {
		padding: 0.25rem 0.5rem;
		font-size: 0.72rem;
		opacity: 0.6;
	}
	.mb-status-history {
		border-top: 1px solid var(--border);
	}
	.mb-status-history-head {
		display: flex;
		align-items: center;
		padding: 0.4rem 0.75rem;
	}
	.mb-status-history-title {
		font-weight: 600;
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		opacity: 0.6;
	}
	.mb-status-run {
		border-top: 1px solid var(--border);
	}
	.mb-status-run-toggle {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		width: 100%;
		padding: 0.35rem 0.75rem;
		background: none;
		border: none;
		color: var(--foreground);
		font-size: 0.8125rem;
		cursor: pointer;
		text-align: left;
	}
	.mb-status-run-toggle:hover {
		background: var(--accent-muted, rgb(0 0 0 / 0.03));
	}
	.mb-status-run-time {
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}
	.mb-status-run-summary {
		opacity: 0.65;
		font-size: 0.75rem;
	}
	.mb-status-run-events {
		max-height: 160px;
		overflow-y: auto;
		padding-bottom: 0.3rem;
	}
</style>
