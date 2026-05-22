<script lang="ts">
	import Breadcrumbs from './Breadcrumbs.svelte';
	import Avatar from './Avatar.svelte';
	import Paperclip from './Paperclip.svelte';
	import type { Account, Folder, Message } from '$lib/data.js';
	import type { OutboxEntry } from '$lib/outbox.js';

	interface OutboxMessage extends Message {
		outbox_status: OutboxEntry['status'];
	}

	let {
		account,
		folder,
		messages,
		outboxEntries = [],
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
		onFolder,
		page = 1,
		perPage = 25,
		count = 0,
		onPageChange
	}: {
		account: Account;
		folder: Folder;
		messages: Message[];
		outboxEntries?: OutboxEntry[];
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
		page?: number;
		perPage?: number;
		count?: number;
		onPageChange?: (page: number) => void;
	} = $props();

	// Convert outbox entries to displayable messages for Outbox/Sent folders
	let outboxMessages = $derived<OutboxMessage[]>(
		outboxEntries
			.filter((e) => e.status === 'queued' || e.status === 'failed' || e.status === 'sending')
			.map((e) => ({
				id: e.id,
				from: account.address,
				addr: account.address,
				subject: (e.message.subject as string) || '(no subject)',
				preview: (e.message.body as string)?.slice(0, 80) || '',
				time: e.composed_at,
				unread: false,
				flags: '',
				outbox_status: e.status
			}))
	);

	let listEl = $state<HTMLDivElement | null>(null);
	let searchInputEl = $state<HTMLInputElement | null>(null);

	$effect(() => {
		const el = listEl?.querySelector<HTMLElement>(`[data-msg-idx="${selectedIdx}"]`);
		el?.scrollIntoView({ block: 'nearest' });
	});

	$effect(() => {
		if (searchOpen) setTimeout(() => searchInputEl?.focus(), 30);
	});

	// Merge outbox entries at top of list for any folder (they're unsent)
	let allMessages = $derived<(Message | OutboxMessage)[]>([...outboxMessages, ...messages]);

	let filtered = $derived.by(() => {
		const q = (searchQuery || '').trim().toLowerCase();
		if (!q) return allMessages;
		return allMessages.filter((m) =>
			`${m.from} ${m.addr} ${m.subject} ${m.preview}`.toLowerCase().includes(q)
		);
	});

	let unread = $derived(messages.filter((m) => m.unread).length);
</script>

<div class="mb-list-screen" data-testid="mail-list.container">
	<Breadcrumbs {account} {folder} {onHome} {onAccount} {onFolder}>
		{#snippet right()}
			<span class="count"><strong>{unread}</strong> unread</span>
			<span>·</span>
			{#if count > perPage && onPageChange}
				{@const lastPage = Math.ceil(count / perPage)}
				{@const start = (page - 1) * perPage + 1}
				{@const end = Math.min(page * perPage, count)}
				<button class="pg-btn" disabled={page <= 1} onclick={() => onPageChange!(page - 1)} aria-label="Previous page" data-testid="mail-list.prev-btn">‹</button>
				<span class="count">page {page}: {start}–{end} of {count}</span>
				<button class="pg-btn" disabled={page >= lastPage} onclick={() => onPageChange!(page + 1)} aria-label="Next page" data-testid="mail-list.next-btn">›</button>
			{:else}
				<span class="count"><strong>{filtered.length}</strong> / {messages.length}</span>
			{/if}
		{/snippet}
	</Breadcrumbs>

	{#if searchOpen}
		<div class="mb-search">
			<span class="prompt">/</span>
			<input
				bind:this={searchInputEl}
				data-testid="mail-list.search-input"
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
					data-testid="mail-list.message-row"
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
								{'outbox_status' in m && (m.outbox_status === 'queued' || m.outbox_status === 'failed' || m.outbox_status === 'sending')
									? ''
									: m.time}
								{#if 'outbox_status' in m}
									<span class="mb-not-sent-badge" data-status={m.outbox_status}>
										{m.outbox_status === 'failed' ? 'Failed' : m.outbox_status === 'sending' ? 'Sending…' : 'Not sent'}
									</span>
								{/if}
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

<style>
	.pg-btn {
		background: none;
		border: none;
		padding: 0 3px;
		font-size: 0.9rem;
		line-height: 1;
		cursor: pointer;
		color: inherit;
		opacity: 0.8;
	}
	.pg-btn:hover:not(:disabled) { opacity: 1; }
	.pg-btn:disabled { opacity: 0.3; cursor: not-allowed; }

	.mb-not-sent-badge {
		display: inline-block;
		padding: 1px 5px;
		border-radius: 4px;
		font-size: 10px;
		font-weight: 600;
		letter-spacing: .03em;
		vertical-align: middle;
		background: color-mix(in srgb, var(--accent, #6366f1) 15%, transparent);
		color: var(--accent, #6366f1);
	}
	.mb-not-sent-badge[data-status="failed"] {
		background: color-mix(in srgb, #ef4444 15%, transparent);
		color: #ef4444;
	}
	.mb-not-sent-badge[data-status="sending"] {
		background: color-mix(in srgb, #f59e0b 15%, transparent);
		color: #b45309;
	}
</style>
