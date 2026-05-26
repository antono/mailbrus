<script lang="ts">
	import { fmtBytes, attExt } from '$lib/utils.js';
	import type { Attachment } from '$lib/data.js';
	import { getSettings } from '$lib/settings.js';

	let { messageId, items }: { messageId: string; items?: Attachment[] } = $props();

	function handleClick(a: Attachment) {
		const url = `/api/messages/${encodeURIComponent(messageId)}/attachments/${a.part_index}`;
		if (getSettings().attachment_action === 'download') {
			const anchor = document.createElement('a');
			anchor.href = url;
			anchor.download = a.name;
			document.body.appendChild(anchor);
			anchor.click();
			document.body.removeChild(anchor);
		} else {
			fetch(`${url}/open`, { method: 'POST' });
		}
	}
</script>

{#if items && items.length > 0}
	<div class="mb-att-row mb-scroll" aria-label="Attachments">
		{#each items as a}
			<button
				type="button"
				class="mb-att"
				data-testid="attachment-chip"
				title="{a.name} — {fmtBytes(a.size)}"
				onclick={() => handleClick(a)}
			>
				<span class="mb-att-ext">{attExt(a.name)}</span>
				<span class="mb-att-name">{a.name}</span>
				<span class="mb-att-size">{fmtBytes(a.size)}</span>
			</button>
		{/each}
	</div>
{/if}
