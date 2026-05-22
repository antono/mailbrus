<script lang="ts">
	import Palette from './Palette.svelte';
	import type { Account, Folder } from '$lib/data.js';

	let {
		account,
		folders,
		onSelect,
		onCancel,
		rankedIds = []
	}: {
		account: Account;
		folders: Folder[];
		onSelect: (f: Folder) => void;
		onCancel?: () => void;
		rankedIds?: string[];
	} = $props();

	let sortedFolders = $derived.by(() => {
		if (!rankedIds.length) return folders;
		return [...folders].sort((a, b) => {
			const ai = rankedIds.indexOf(a.id);
			const bi = rankedIds.indexOf(b.id);
			if (ai === -1 && bi === -1) return 0;
			if (ai === -1) return 1;
			if (bi === -1) return -1;
			return ai - bi;
		});
	});

	let items = $derived(
		sortedFolders.map((f) => ({
			key: f.id,
			primary: f.name,
			secondary: `${account.maildir}/${f.id}`,
			meta: f.unread > 0 ? `${f.unread} / ${f.total}` : `${f.total}`,
			raw: f
		}))
	);
</script>

<Palette
	eyebrow="{account.address}  ·  select folder"
	title="Open a folder"
	placeholder="Filter folders…"
	{items}
	onSelect={(it) => onSelect((it as typeof items[0]).raw)}
	{onCancel}
	emptyText="No folders match."
	curtainTestId="folders.curtain"
/>
