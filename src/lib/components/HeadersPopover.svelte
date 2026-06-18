<script lang="ts">
	// openspec/changes/isolate-hotkeys/specs/ui-hotkeys/spec.md
	// openspec/changes/hotkeys-improvement/specs/reader-message-actions/spec.md (g h toggles headers menu)
	import { untrack } from 'svelte';
	import { pushScope, popScope } from '$lib/hotkeys/scope.svelte.ts';
	import { registerKeymap } from '$lib/hotkeys/registry.svelte.ts';
	import type { Keymap } from '$lib/hotkeys/types.ts';

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
		// The popover owns a modal-scope keymap so Escape closes it; it also binds the
		// `g h` leader to close so the reader's open/close toggle is symmetric (the
		// reader scope is suppressed beneath this exclusive modal scope).
		const km: Keymap = {
			scope: 'modal',
			bindings: [
				{ keys: ['Escape'], group: 'Modal', description: 'Close', handler: (e) => { e.preventDefault(); onClose(); } },
				{ keys: ['g', 'h'], group: 'Modal', description: 'Close headers', handler: (e) => { e.preventDefault(); onClose(); } }
			]
		};
		const dispose = registerKeymap(untrack(() => km));
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
