<script lang="ts">
	import { Dialog, Label, Separator, Switch, Select, ToggleGroup } from 'bits-ui';
	import type { UiPrefs } from '$lib/settings.js';
	import { authHeaders } from '$lib/api.js';
	// openspec/changes/isolate-hotkeys/specs/ui-hotkeys/spec.md
	import { untrack } from 'svelte';
	import { pushScope, popScope } from '$lib/hotkeys/scope.svelte.ts';
	import { registerKeymap } from '$lib/hotkeys/registry.svelte.ts';
	import { createModalKeymap } from '$lib/hotkeys/keymaps/modal.ts';

	let {
		open = $bindable(false),
		uiPrefs,
		onPrefChange,
		attachmentAction = 'open',
		onAttachmentActionChange
	}: {
		open: boolean;
		uiPrefs: UiPrefs;
		onPrefChange: <K extends keyof UiPrefs>(key: K, val: UiPrefs[K]) => void;
		attachmentAction?: 'open' | 'download';
		onAttachmentActionChange?: (v: 'open' | 'download') => void;
	} = $props();

	function set<K extends keyof UiPrefs>(key: K, val: UiPrefs[K]) {
		onPrefChange(key, val);
	}

	// push notifications
	let pushEnabled = $state(false);
	let pushSupported = $state(false);

	$effect(() => {
		if (!open) return;
		pushSupported = 'Notification' in window && 'serviceWorker' in navigator;
		if (pushSupported) pushEnabled = Notification.permission === 'granted';
	});

	$effect(() => {
		if (!open) return;
		pushScope('modal');
		const dispose = registerKeymap(untrack(() => createModalKeymap({ close: () => (open = false) })));
		return () => {
			dispose();
			popScope('modal');
		};
	});

	async function togglePush() {
		if (!pushSupported) return;
		if (pushEnabled) {
			const reg = await navigator.serviceWorker.ready;
			const sub = await reg.pushManager.getSubscription();
			if (sub) {
				await sub.unsubscribe();
				await fetch('/api/push/subscribe', {
					method: 'DELETE',
					headers: { 'content-type': 'application/json', ...authHeaders() },
					body: JSON.stringify({ account: '' })
				}).catch(() => {});
			}
			pushEnabled = false;
		} else {
			const vapidRes = await fetch('/api/push/vapid-key', { headers: authHeaders() }).catch(() => null);
			const vapid = vapidRes?.ok ? await vapidRes.json() : null;
			const reg = await navigator.serviceWorker.ready;
			try {
				const sub = await reg.pushManager.subscribe({
					userVisibleOnly: true,
					applicationServerKey: vapid?.publicKey
				});
				const subJson = sub.toJSON();
				await fetch('/api/push/subscribe', {
					method: 'POST',
					headers: { 'content-type': 'application/json', ...authHeaders() },
					body: JSON.stringify({ account: '', endpoint: sub.endpoint, keys: subJson.keys ?? {} })
				}).catch(() => {});
				pushEnabled = true;
			} catch {
				pushEnabled = false;
			}
		}
	}

	const ACCENT_OPTIONS = [
		{ value: 'indigo', label: 'Indigo' },
		{ value: 'violet', label: 'Violet' },
		{ value: 'blue',   label: 'Blue'   },
		{ value: 'green',  label: 'Green'  },
		{ value: 'rose',   label: 'Rose'   },
		{ value: 'amber',  label: 'Amber'  },
		{ value: 'mono',   label: 'Mono'   },
	];
	const FONTS      = ['sans', 'mono'];
	const FONT_SIZES = ['xs', 'sm', 'md', 'lg'];
	const DENSITIES  = ['dense', 'twoline', 'spacious'];
</script>

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay class="sp-overlay" data-testid="settings.backdrop" />
		<Dialog.Content class="sp-content" data-testid="settings.panel">
			<!-- Header -->
			<div class="sp-header">
				<Dialog.Title class="sp-title">Settings</Dialog.Title>
				<Dialog.Close class="sp-close" aria-label="Close settings" data-testid="settings.close-btn">✕</Dialog.Close>
			</div>

			<div class="sp-body">
				<!-- ── Theme ─────────────────────────────────────── -->
				<p class="sp-section-label">Theme</p>

				<div class="sp-row sp-row-switch">
					<Label.Root class="sp-label" for="sp-dark">Dark mode</Label.Root>
					<Switch.Root
						id="sp-dark"
						class="sp-switch"
						checked={uiPrefs.dark}
						onCheckedChange={(v) => set('dark', v)}
						data-testid="settings.dark-toggle"
					>
						<Switch.Thumb class="sp-switch-thumb" />
					</Switch.Root>
				</div>

				<div class="sp-row sp-row-col">
					<Label.Root class="sp-label" for="sp-accent">Accent</Label.Root>
					<Select.Root
						type="single"
						value={uiPrefs.accent}
						onValueChange={(v) => v && set('accent', v)}
					>
						<Select.Trigger class="sp-select-trigger" id="sp-accent" data-testid="settings.accent-select">
							<Select.Value />
							<span class="sp-select-icon" aria-hidden="true">▾</span>
						</Select.Trigger>
						<Select.Portal>
							<Select.Content class="sp-select-content" sideOffset={4}>
								<Select.Viewport>
									{#each ACCENT_OPTIONS as opt}
										<Select.Item class="sp-select-item" value={opt.value} label={opt.label}>
											{opt.label}
										</Select.Item>
									{/each}
								</Select.Viewport>
							</Select.Content>
						</Select.Portal>
					</Select.Root>
				</div>

				<Separator.Root class="sp-sep" />

				<!-- ── Typography ────────────────────────────────── -->
				<p class="sp-section-label">Typography</p>

				<div class="sp-row sp-row-col">
					<Label.Root class="sp-label">Font</Label.Root>
					<ToggleGroup.Root
						type="single"
						value={uiPrefs.font}
						onValueChange={(v) => v && set('font', v)}
						class="sp-toggle-group"
						data-testid="settings.font-seg"
					>
						{#each FONTS as f}
							<ToggleGroup.Item value={f} class="sp-toggle-item" data-testid="settings.font-radio">
								{f}
							</ToggleGroup.Item>
						{/each}
					</ToggleGroup.Root>
				</div>

				<div class="sp-row sp-row-col">
					<Label.Root class="sp-label">Size</Label.Root>
					<ToggleGroup.Root
						type="single"
						value={uiPrefs.fontSize}
						onValueChange={(v) => v && set('fontSize', v)}
						class="sp-toggle-group"
						data-testid="settings.font-size-seg"
					>
						{#each FONT_SIZES as s}
							<ToggleGroup.Item value={s} class="sp-toggle-item" data-testid="settings.font-size-radio">
								{s}
							</ToggleGroup.Item>
						{/each}
					</ToggleGroup.Root>
				</div>

				<Separator.Root class="sp-sep" />

				<!-- ── Layout ─────────────────────────────────────── -->
				<p class="sp-section-label">Layout</p>

				<div class="sp-row sp-row-col">
					<Label.Root class="sp-label">Density</Label.Root>
					<ToggleGroup.Root
						type="single"
						value={uiPrefs.density}
						onValueChange={(v) => v && set('density', v)}
						class="sp-toggle-group"
						data-testid="settings.density-seg"
					>
						{#each DENSITIES as d}
							<ToggleGroup.Item value={d} class="sp-toggle-item" data-testid="settings.density-radio">
								{d}
							</ToggleGroup.Item>
						{/each}
					</ToggleGroup.Root>
				</div>

				<div class="sp-row sp-row-switch">
					<Label.Root class="sp-label" for="sp-hintbar">Show key hints</Label.Root>
					<Switch.Root
						id="sp-hintbar"
						class="sp-switch"
						checked={uiPrefs.hintBar}
						onCheckedChange={(v) => set('hintBar', v)}
						data-testid="settings.hints-toggle"
					>
						<Switch.Thumb class="sp-switch-thumb" />
					</Switch.Root>
				</div>

				<Separator.Root class="sp-sep" />

				<!-- ── Attachments ───────────────────────────────── -->
				<p class="sp-section-label">Attachments</p>

				<div class="sp-row sp-row-col">
					<Label.Root class="sp-label">Click action</Label.Root>
					<ToggleGroup.Root
						type="single"
						value={attachmentAction}
						onValueChange={(v) => v && onAttachmentActionChange?.(v as 'open' | 'download')}
						class="sp-toggle-group"
						data-testid="settings.attachment-action-seg"
					>
						<ToggleGroup.Item value="open" class="sp-toggle-item" data-testid="settings.att-open">open</ToggleGroup.Item>
						<ToggleGroup.Item value="download" class="sp-toggle-item" data-testid="settings.att-download">download</ToggleGroup.Item>
					</ToggleGroup.Root>
				</div>

				{#if pushSupported}
					<Separator.Root class="sp-sep" />
					<p class="sp-section-label">Notifications</p>
					<div class="sp-row sp-row-switch">
						<Label.Root class="sp-label" for="sp-push">Enable notifications</Label.Root>
						<Switch.Root
							id="sp-push"
							class="sp-switch"
							checked={pushEnabled}
							onCheckedChange={togglePush}
							data-testid="settings.notifications-toggle"
						>
							<Switch.Thumb class="sp-switch-thumb" />
						</Switch.Root>
					</div>
				{/if}
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	/* Overlay */
	:global(.sp-overlay) {
		position: fixed;
		inset: 0;
		z-index: 50;
		background: oklch(0 0 0 / 0.4);
	}

	/* Content panel */
	:global(.sp-content) {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		z-index: 51;
		width: min(360px, calc(100vw - 2rem));
		max-height: calc(100dvh - 4rem);
		display: flex;
		flex-direction: column;
		background: var(--card);
		color: var(--card-foreground);
		border: 1px solid var(--border);
		border-radius: var(--radius-xl);
		box-shadow: var(--shadow-xl);
		outline: none;
	}

	/* Header */
	:global(.sp-header) {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.875rem 0.75rem 0.875rem 1rem;
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}
	:global(.sp-title) {
		font-size: var(--text-base);
		font-weight: var(--weight-semibold);
		color: var(--foreground);
		margin: 0;
	}
	:global(.sp-close) {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.75rem;
		height: 1.75rem;
		border-radius: var(--radius-md);
		border: none;
		background: transparent;
		color: var(--muted-foreground);
		cursor: pointer;
		font-size: 0.875rem;
		line-height: 1;
		transition: background var(--duration-fast), color var(--duration-fast);
	}
	:global(.sp-close:hover) {
		background: var(--muted);
		color: var(--foreground);
	}

	/* Scrollable body */
	:global(.sp-body) {
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.625rem;
		overflow-y: auto;
		scrollbar-width: thin;
		scrollbar-color: var(--border) transparent;
	}

	/* Section labels */
	:global(.sp-section-label) {
		font-size: var(--text-xs);
		font-weight: var(--weight-semibold);
		letter-spacing: var(--tracking-wide);
		text-transform: uppercase;
		color: var(--muted-foreground);
		margin: 0.375rem 0 0;
	}
	:global(.sp-section-label:first-child) { margin-top: 0; }

	/* Row layouts */
	:global(.sp-row) { display: flex; gap: 0.5rem; }
	:global(.sp-row-switch) { align-items: center; justify-content: space-between; }
	:global(.sp-row-col) { flex-direction: column; gap: 0.375rem; }

	/* Label */
	:global(.sp-label) {
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--foreground);
		line-height: 1.4;
		cursor: default;
	}

	/* Separator */
	:global(.sp-sep) {
		height: 1px;
		background: var(--border);
		border: none;
		margin: 0.25rem 0;
	}

	/* Switch */
	:global(.sp-switch) {
		position: relative;
		display: inline-flex;
		width: 2.25rem;
		height: 1.25rem;
		flex-shrink: 0;
		cursor: pointer;
		border-radius: var(--radius-full);
		border: none;
		background: var(--muted);
		transition: background var(--duration-fast) var(--ease-out);
		padding: 0;
	}
	:global(.sp-switch[data-state="checked"]) {
		background: var(--brand);
	}
	:global(.sp-switch-thumb) {
		position: absolute;
		top: 0.125rem;
		left: 0.125rem;
		width: 1rem;
		height: 1rem;
		border-radius: var(--radius-full);
		background: white;
		box-shadow: var(--shadow-sm);
		transition: transform var(--duration-fast) var(--ease-out);
	}
	:global(.sp-switch[data-state="checked"] .sp-switch-thumb) {
		transform: translateX(1rem);
	}

	/* Select trigger */
	:global(.sp-select-trigger) {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		height: 2rem;
		padding: 0 0.625rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--background);
		color: var(--foreground);
		font: inherit;
		font-size: var(--text-sm);
		cursor: pointer;
		outline: none;
		transition: border-color var(--duration-fast), box-shadow var(--duration-fast);
	}
	:global(.sp-select-trigger:focus-visible) {
		border-color: var(--brand);
		box-shadow: var(--shadow-focus);
	}
	:global(.sp-select-icon) {
		color: var(--muted-foreground);
		font-size: 0.7rem;
		pointer-events: none;
	}

	/* Select dropdown */
	:global(.sp-select-content) {
		z-index: 52;
		min-width: var(--bits-select-anchor-width);
		background: var(--popover);
		color: var(--popover-foreground);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-lg);
		padding: 0.25rem;
		outline: none;
	}
	:global(.sp-select-item) {
		display: flex;
		align-items: center;
		padding: 0.375rem 0.625rem;
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
		cursor: pointer;
		outline: none;
		transition: background var(--duration-fast);
	}
	:global(.sp-select-item[data-highlighted]) {
		background: var(--accent);
		color: var(--accent-foreground);
	}
	:global(.sp-select-item[data-state="checked"]) {
		font-weight: var(--weight-medium);
		color: var(--brand);
	}

	/* ToggleGroup (segmented control) */
	:global(.sp-toggle-group) {
		display: flex;
		border-radius: var(--radius-md);
		border: 1px solid var(--border);
		overflow: hidden;
		background: var(--muted);
		gap: 0;
	}
	:global(.sp-toggle-item) {
		flex: 1;
		padding: 0.3125rem 0.5rem;
		border: none;
		background: transparent;
		color: var(--muted-foreground);
		font: inherit;
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		cursor: pointer;
		transition: background var(--duration-fast), color var(--duration-fast);
		border-right: 1px solid var(--border);
		outline: none;
	}
	:global(.sp-toggle-item:last-child) { border-right: none; }
	:global(.sp-toggle-item[data-state="on"]) {
		background: var(--background);
		color: var(--foreground);
		box-shadow: var(--shadow-xs);
	}
	:global(.sp-toggle-item:focus-visible) {
		box-shadow: var(--shadow-focus);
		z-index: 1;
		position: relative;
	}
</style>
