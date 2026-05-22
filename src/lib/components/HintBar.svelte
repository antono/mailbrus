<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		onShowHelp,
		children
	}: {
		onShowHelp: () => void;
		children?: Snippet;
	} = $props();

	let innerEl = $state<HTMLDivElement | null>(null);
	let overflowing = $state(false);

	$effect(() => {
		const el = innerEl;
		if (!el) return;
		const check = () => {
			overflowing = el.scrollWidth > el.clientWidth + 2;
		};
		check();
		const ro = new ResizeObserver(check);
		ro.observe(el);
		for (const c of el.children) ro.observe(c);
		return () => ro.disconnect();
	});
</script>

<div class="mb-hints">
	<div class="mb-hints-left" bind:this={innerEl}>
		{#if children}{@render children()}{/if}
	</div>
	{#if overflowing}
		<button
			type="button"
			class="mb-hints-overflow"
			onclick={onShowHelp}
			title="Show all keyboard shortcuts (?)"
			aria-label="Show all keyboard shortcuts"
			data-testid="hint-bar.overflow-btn"
		>
			?
		</button>
	{/if}
	<div class="mb-hints-right">
		<span class="hint"><span class="kbd">⌘</span><span class="kbd">k</span> commands</span>
	</div>
</div>
