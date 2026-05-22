<script lang="ts">
	import Palette from './Palette.svelte';
	import type { Account } from '$lib/data.js';

	let {
		accounts,
		onSelect,
		onCancel,
		returning = false
	}: {
		accounts: Account[];
		onSelect: (a: Account) => void;
		onCancel?: () => void;
		returning?: boolean;
	} = $props();

	let items = $derived(
		accounts.map((a) => ({
			key: a.id,
			primary: a.address,
			secondary: `${a.maildir}   ${a.host}`,
			meta: a.unread > 0 ? `${a.unread} unread` : `${a.total}`,
			raw: a
		}))
	);
</script>

<Palette
	eyebrow="select account"
	title="Open a maildir"
	placeholder="Filter accounts…"
	items={items}
	onSelect={(it) => onSelect((it as typeof items[0]).raw)}
	{onCancel}
	showCancelHint={returning}
	emptyText="No accounts match."
	curtainTestId="accounts.curtain"
/>
