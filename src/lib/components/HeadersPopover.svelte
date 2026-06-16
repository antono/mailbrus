<script lang="ts">
	// openspec/changes/isolate-hotkeys/specs/ui-hotkeys/spec.md
	import { untrack } from 'svelte';
	import { pushScope, popScope } from '$lib/hotkeys/scope.svelte.ts';
	import { registerKeymap } from '$lib/hotkeys/registry.svelte.ts';
	import { createModalKeymap } from '$lib/hotkeys/keymaps/modal.ts';

	let {
		headers,
		onClose
	}: {
		headers: [string, string][];
		onClose: () => void;
	} = $props();

	let el = $state<HTMLDivElement | null>(null);

	$effect(() => {
		const onDown = (e: MouseEvent) => {
			if (el && !el.contains(e.target as Node)) onClose();
		};
		document.addEventListener('mousedown', onDown);
		pushScope('modal');
		const dispose = registerKeymap(untrack(() => createModalKeymap({ close: onClose })));
		return () => {
			document.removeEventListener('mousedown', onDown);
			dispose();
			popScope('modal');
		};
	});
</script>

<div class="mb-headers-pop" bind:this={el} role="dialog" aria-label="Message headers" data-testid="headers-popover.container">
	<div class="mb-headers-pop-head">
		<span class="eyebrow">message headers</span>
		<button type="button" class="mb-headers-close" onclick={onClose} aria-label="Close headers" data-testid="headers-popover.close-btn">
			×
		</button>
	</div>
	<div class="mb-headers-pop-body mb-scroll">
		{#each headers as [k, v]}
			<div class="mb-header-row">
				<span class="mb-header-k">{k}:</span>
				<span class="mb-header-v">{v}</span>
			</div>
		{/each}
	</div>
</div>
