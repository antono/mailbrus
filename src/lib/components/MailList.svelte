<script lang="ts">
	import Breadcrumbs from './Breadcrumbs.svelte';
	import Avatar from './Avatar.svelte';
	import Paperclip from './Paperclip.svelte';
	import type { Account, Folder, Message } from '$lib/data.js';

	let {
		account,
		folder,
		messages,
		density,
		selectedIdx,
		onSelectIdx,
		searchOpen,
		searchQuery,
		onSearchChange,
		onSearchSubmit,
		onSearchClose,
		onOpen,
		onHome,
		onAccount,
		onFolder
	}: {
		account: Account;
		folder: Folder;
		messages: Message[];
		density: string;
		selectedIdx: number;
		onSelectIdx: (i: number) => void;
		searchOpen: boolean;
		searchQuery: string;
		onSearchChange: (q: string) => void;
		onSearchSubmit: () => void;
		onSearchClose: () => void;
		onOpen: (m: Message) => void;
		onHome: () => void;
		onAccount: () => void;
		onFolder: () => void;
	} = $props();

	let listEl = $state<HTMLDivElement | null>(null);
	let searchInputEl = $state<HTMLInputElement | null>(null);

	$effect(() => {
		const el = listEl?.querySelector<HTMLElement>(`[data-msg-idx="${selectedIdx}"]`);
		el?.scrollIntoView({ block: 'nearest' });
	});

	$effect(() => {
		if (searchOpen) setTimeout(() => searchInputEl?.focus(), 30);
	});

	let filtered = $derived.by(() => {
		const q = (searchQuery || '').trim().toLowerCase();
		if (!q) return messages;
		return messages.filter((m) =>
			`${m.from} ${m.addr} ${m.subject} ${m.preview}`.toLowerCase().includes(q)
		);
	});

	let unread = $derived(messages.filter((m) => m.unread).length);
</script>

<div class="mb-list-screen">
	<Breadcrumbs {account} {folder} {onHome} {onAccount} {onFolder}>
		{#snippet right()}
			<span class="count"><strong>{unread}</strong> unread</span>
			<span>·</span>
			<span class="count"><strong>{filtered.length}</strong> / {messages.length}</span>
		{/snippet}
	</Breadcrumbs>

	{#if searchOpen}
		<div class="mb-search">
			<span class="prompt">/</span>
			<input
				bind:this={searchInputEl}
				value={searchQuery}
				oninput={(e) => onSearchChange((e.target as HTMLInputElement).value)}
				onkeydown={(e) => {
					if (e.key === 'Escape') { e.preventDefault(); onSearchClose(); }
					if (e.key === 'Enter') { e.preventDefault(); onSearchSubmit(); }
				}}
				placeholder="filter sender, subject, body…"
				spellcheck={false}
			/>
			<span class="hint">esc clears · enter applies</span>
		</div>
	{/if}

	<div class={`mb-mail-list mb-scroll dens-${density}`} bind:this={listEl}>
		{#if filtered.length === 0}
			<div class="mb-empty">
				<div class="big">You're all caught up.</div>
				<div>Nothing left to read in {folder.name}.</div>
			</div>
		{:else}
			{#each filtered as m, i}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					data-msg-idx={i}
					class="mb-msg{m.unread ? ' unread' : ''}{i === selectedIdx ? ' active' : ''}"
					onmouseenter={() => onSelectIdx(i)}
					onclick={() => onOpen(m)}
				>
					{#if density === 'spacious'}
						<div class="flag"><Avatar email={m.addr} name={m.from} size={32} /></div>
					{:else}
						<div class="flag">{m.unread ? '' : (m.flags || '')}</div>
					{/if}

					{#if density === 'twoline'}
						<div class="head">
							<span class="from">{m.from}</span>
							<span class="time">
								{#if m.attachments && m.attachments.length > 0}<Paperclip />{/if}
								{m.time}
							</span>
						</div>
						<div class="body-row">
							<span class="subject">{m.subject}</span>
							<span class="preview">{m.preview}</span>
						</div>
					{:else if density === 'spacious'}
						<div class="head"><span class="from">{m.from}</span></div>
						<div class="subject">{m.subject}</div>
						<div class="preview">{m.preview}</div>
						<div class="time">
							{#if m.attachments && m.attachments.length > 0}<Paperclip />{/if}
							{m.time}
						</div>
					{:else}
						<div class="from">{m.from}</div>
						<div class="subject">{m.subject}</div>
						<div class="time">
							{#if m.attachments && m.attachments.length > 0}<Paperclip />{/if}
							{m.time}
						</div>
					{/if}
				</div>
			{/each}
		{/if}
	</div>
</div>
