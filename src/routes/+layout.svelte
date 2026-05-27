<script lang="ts">
	// openspec/changes/isolate-hotkeys/specs/ui-hotkeys/spec.md
	import { installDispatcher } from '$lib/hotkeys/dispatcher.svelte.ts';
	import { registerKeymap } from '$lib/hotkeys/registry.svelte.ts';
	import { globalKeymap } from '$lib/hotkeys/global.ts';

	let { children } = $props();

	$effect(() => {
		const disposeDispatcher = installDispatcher();
		const disposeGlobal = registerKeymap(globalKeymap);
		return () => {
			disposeGlobal();
			disposeDispatcher();
		};
	});
</script>

{@render children?.()}
