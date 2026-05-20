<script lang="ts">
	import Palette from './Palette.svelte';
	import type { Account, Folder } from '$lib/data.js';

	let {
		account,
		folders,
		onSelect,
		onCancel
	}: {
		account: Account;
		folders: Folder[];
		onSelect: (f: Folder) => void;
		onCancel?: () => void;
	} = $props();

	let items = $derived(
		folders.map((f) => ({
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
/>
