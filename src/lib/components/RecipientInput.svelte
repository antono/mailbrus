<script lang="ts">
	import { buildContacts, type Contact } from '$lib/utils.js';
	import { recordVisit, getRanked } from '$lib/frecency.js';

	let {
		id,
		value,
		onChange,
		placeholder = '',
		autoFocus = false
	}: {
		id?: string;
		value: string;
		onChange: (v: string) => void;
		placeholder?: string;
		autoFocus?: boolean;
	} = $props();

	let inputEl = $state<HTMLInputElement | null>(null);
	let openSugg = $state(false);
	let sIdx = $state(0);

	const contacts = buildContacts();
	let rankedContacts = $state<string[]>([]);

	$effect(() => {
		getRanked('contacts').then((ids) => { rankedContacts = ids; }).catch(() => {});
	});

	$effect(() => {
		if (autoFocus) {
			const t = setTimeout(() => inputEl?.focus(), 30);
			return () => clearTimeout(t);
		}
	});

	let caretPos = $derived(inputEl?.selectionStart ?? value.length);

	let tokens = $derived.by(() => {
		const before = value.slice(0, caretPos);
		const after = value.slice(caretPos);
		const lastSep = Math.max(before.lastIndexOf(','), before.lastIndexOf(';'));
		const start = lastSep + 1;
		const nextCommaRel = after.search(/[,;]/);
		const end = nextCommaRel === -1 ? value.length : caretPos + nextCommaRel;
		return { start, end, current: value.slice(start, end) };
	});

	let trimmed = $derived(tokens.current.trim().toLowerCase());

	let suggestions = $derived.by(() => {
		const already = new Set(
			value
				.split(/[,;]/)
				.map((s) => s.trim().toLowerCase())
				.filter(Boolean)
				.map((s) => {
					const m = s.match(/<([^>]+)>/);
					return (m ? m[1] : s).toLowerCase();
				})
		);
		const filtered = contacts.filter((c) => {
			if (already.has(c.addr.toLowerCase())) return false;
			if (!trimmed) return true;
			return `${c.name} ${c.addr}`.toLowerCase().includes(trimmed);
		});
		// task 9.6: sort by frecency rank
		if (rankedContacts.length) {
			filtered.sort((a, b) => {
				const ai = rankedContacts.indexOf(a.addr);
				const bi = rankedContacts.indexOf(b.addr);
				if (ai === -1 && bi === -1) return 0;
				if (ai === -1) return 1;
				if (bi === -1) return -1;
				return ai - bi;
			});
		}
		return filtered.slice(0, 8);
	});

	$effect(() => {
		void trimmed;
		void openSugg;
		sIdx = 0;
	});

	function acceptSuggestion(contact: Contact) {
		// task 9.5: record frecency visit for this contact
		recordVisit('contacts', contact.addr).catch(() => {});
		const formatted =
			contact.name && contact.name !== contact.addr
				? `${contact.name} <${contact.addr}>`
				: contact.addr;
		const before = value.slice(0, tokens.start);
		const after = value.slice(tokens.end);
		const next = (before + formatted + ', ' + after.replace(/^[\s,;]+/, '')).replace(
			/^[\s,;]+/,
			''
		);
		const newCaret = (before + formatted + ', ').length;
		onChange(next);
		openSugg = false;
		requestAnimationFrame(() => {
			if (inputEl) {
				inputEl.focus();
				inputEl.setSelectionRange(newCaret, newCaret);
			}
		});
	}

	function onKey(e: KeyboardEvent) {
		if (openSugg && suggestions.length > 0) {
			if (e.key === 'ArrowDown') {
				e.preventDefault();
				sIdx = Math.min(sIdx + 1, suggestions.length - 1);
				return;
			}
			if (e.key === 'ArrowUp') {
				e.preventDefault();
				sIdx = Math.max(sIdx - 1, 0);
				return;
			}
			if (e.key === 'Enter' || e.key === 'Tab') {
				e.preventDefault();
				acceptSuggestion(suggestions[sIdx]);
				return;
			}
			if (e.key === 'Escape') {
				e.preventDefault();
				openSugg = false;
				return;
			}
		}
		if (e.key === ',' || e.key === ';') {
			openSugg = true;
		}
	}
</script>

<div class="cf-autocomplete">
	<input
		{id}
		bind:this={inputEl}
		class="cf-input"
		type="text"
		{value}
		oninput={(e) => { onChange((e.target as HTMLInputElement).value); openSugg = true; }}
		onfocus={() => (openSugg = true)}
		onblur={() => setTimeout(() => (openSugg = false), 120)}
		onkeydown={onKey}
		{placeholder}
		spellcheck={false}
		autocomplete="off"
	/>
	{#if openSugg && suggestions.length > 0}
		<div class="cf-sugg mb-scroll" role="listbox">
			{#each suggestions as c, i}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					role="option"
					tabindex="-1"
					aria-selected={i === sIdx}
					class="cf-sugg-row{i === sIdx ? ' active' : ''}"
					onmousedown={(e) => { e.preventDefault(); acceptSuggestion(c); }}
					onmouseenter={() => (sIdx = i)}
				>
					<span class="cf-sugg-name">{c.name === c.addr ? c.addr : c.name}</span>
					{#if c.name !== c.addr}
						<span class="cf-sugg-addr">{c.addr}</span>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>
