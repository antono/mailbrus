<script lang="ts">
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
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
		};
		document.addEventListener('mousedown', onDown);
		document.addEventListener('keydown', onKey, true);
		return () => {
			document.removeEventListener('mousedown', onDown);
			document.removeEventListener('keydown', onKey, true);
		};
	});
</script>

<div class="mb-headers-pop" bind:this={el} role="dialog" aria-label="Message headers">
	<div class="mb-headers-pop-head">
		<span class="eyebrow">message headers</span>
		<button type="button" class="mb-headers-close" onclick={onClose} aria-label="Close headers">
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
