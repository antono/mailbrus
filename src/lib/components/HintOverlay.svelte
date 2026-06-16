<script lang="ts">
	import type { HintTarget } from '$lib/hints.js';
	import { onMount } from 'svelte';
	// openspec/changes/isolate-hotkeys/specs/ui-hotkeys/spec.md
	import { useScopedKeymap } from '$lib/hotkeys/scope-bind.svelte.ts';
	import { createHintKeymap } from '$lib/hotkeys/keymaps/hint.ts';

	let {
		targets,
		onCancel
	}: {
		targets: HintTarget[];
		onCancel: () => void;
	} = $props();

	type Pos = { left: number; top: number; label: string };
	let positions = $state<Pos[]>([]);

	function computePositions(): Pos[] {
		return targets
			.map((t) => {
				const r = t.el.getBoundingClientRect();
				if (r.width === 0 && r.height === 0) return null;
				return { left: r.left, top: r.top, label: t.label };
			})
			.filter((p): p is Pos => p !== null);
	}

	onMount(() => {
		positions = computePositions();
	});

	useScopedKeymap('hint', () =>
		createHintKeymap({
			labels: () => targets.map((t) => t.label),
			activate: (label) => {
				const match = targets.find((t) => t.label === label);
				match?.onActivate();
				onCancel();
			},
			cancel: onCancel
		})
	);
</script>

<div
	class="mb-hint-overlay"
	role="dialog"
	aria-modal="true"
	aria-label="Hint mode — press a letter or Escape to cancel"
	data-testid="hint-overlay"
>
	{#each positions as p}
		<span
			class="mb-hint-badge"
			data-testid="hint-badge"
			style="left: {p.left}px; top: {p.top}px;"
		>{p.label}</span>
	{/each}
</div>

<style>
	.mb-hint-overlay {
		position: fixed;
		inset: 0;
		pointer-events: none;
		z-index: 9999;
	}

	.mb-hint-badge {
		position: fixed;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 18px;
		height: 14px;
		padding: 0 3px;
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 11px;
		font-weight: 700;
		line-height: 1;
		text-transform: lowercase;
		background: #fbbf24;
		color: #111;
		border-radius: 3px;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
		transform: translate(-2px, -2px);
		z-index: 9999;
		pointer-events: none;
		user-select: none;
	}

	:global(.dark) .mb-hint-badge {
		background: #1c1917;
		color: #fbbf24;
		border: 1px solid #fbbf24;
	}
</style>
