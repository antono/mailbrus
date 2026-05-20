<script lang="ts">
	import { fmtBytes, attExt } from '$lib/utils.js';
	import type { Attachment } from '$lib/data.js';

	let { items }: { items?: Attachment[] } = $props();
</script>

{#if items && items.length > 0}
	<div class="mb-att-row mb-scroll" aria-label="Attachments">
		{#each items as a}
			<button
				type="button"
				class="mb-att"
				title="{a.name} — {fmtBytes(a.size)}"
				onclick={(e) => e.preventDefault()}
			>
				<span class="mb-att-ext">{attExt(a.name)}</span>
				<span class="mb-att-name">{a.name}</span>
				<span class="mb-att-size">{fmtBytes(a.size)}</span>
			</button>
		{/each}
	</div>
{/if}
