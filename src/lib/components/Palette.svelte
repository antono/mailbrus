<script lang="ts">
	import Wordmark from './Wordmark.svelte';

	export interface PaletteItem {
		key: string;
		primary: string;
		secondary?: string;
		meta?: string;
	}

	let {
		eyebrow,
		title,
		placeholder,
		items,
		onSelect,
		onCancel,
		showCancelHint = true,
		emptyText = 'No matches.'
	}: {
		eyebrow: string;
		title: string;
		placeholder: string;
		items: PaletteItem[];
		onSelect: (item: PaletteItem) => void;
		onCancel?: () => void;
		showCancelHint?: boolean;
		emptyText?: string;
	} = $props();

	let q = $state('');
	let idx = $state(0);
	let inputEl = $state<HTMLInputElement | null>(null);
	let listEl = $state<HTMLDivElement | null>(null);

	$effect(() => {
		const t = setTimeout(() => inputEl?.focus(), 30);
		return () => clearTimeout(t);
	});

	let filtered = $derived.by(() => {
		const needle = q.trim().toLowerCase();
		if (!needle) return items;
		return items.filter((it) => {
			const hay = `${it.primary} ${it.secondary || ''}`.toLowerCase();
			return hay.includes(needle);
		});
	});

	$effect(() => {
		void q;
		idx = 0;
	});

	$effect(() => {
		const el = listEl?.querySelector<HTMLElement>(`[data-idx="${idx}"]`);
		el?.scrollIntoView({ block: 'nearest' });
	});

	function select(i: number) {
		const it = filtered[i];
		if (it) onSelect(it);
	}

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			onCancel?.();
			return;
		}
		if (e.key === 'Enter') {
			e.preventDefault();
			e.stopPropagation();
			select(idx);
			return;
		}
		if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'n')) {
			e.preventDefault();
			idx = Math.min(idx + 1, filtered.length - 1);
			return;
		}
		if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'p')) {
			e.preventDefault();
			idx = Math.max(idx - 1, 0);
			return;
		}
		if (q === '' && (e.key === 'j' || e.key === 'k')) {
			e.preventDefault();
			idx = Math.max(0, Math.min(e.key === 'j' ? idx + 1 : idx - 1, filtered.length - 1));
			return;
		}
		if (q === '' && /^[1-9]$/.test(e.key)) {
			e.preventDefault();
			const n = parseInt(e.key, 10) - 1;
			if (n < filtered.length) select(n);
			return;
		}
	}

	function onCurtainClick(e: MouseEvent) {
		if ((e.target as HTMLElement).classList.contains('mb-curtain')) onCancel?.();
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="mb-curtain" role="dialog" aria-modal="true" onclick={onCurtainClick} data-testid={curtainTestId}>
	<div class="mb-palette">
		<div class="head">
			<div class="eyebrow">
				<span>{eyebrow}</span>
				<Wordmark size={11} />
			</div>
			<div class="title">{title}</div>
			<input
				bind:this={inputEl}
				data-testid="palette.input"
				class="input"
				{placeholder}
				bind:value={q}
				onkeydown={onKey}
				spellcheck={false}
				autocomplete="off"
			/>
		</div>
		<div class="list mb-scroll" bind:this={listEl}>
			{#if filtered.length === 0}
				<div class="empty">{emptyText}</div>
			{:else}
				{#each filtered as it, i}
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						data-idx={i}
						data-testid="palette.row"
						class="mb-row{i === idx ? ' active' : ''}"
						onmouseenter={() => (idx = i)}
						onclick={() => select(i)}
					>
						<div class="num">{i < 9 ? i + 1 : '·'}</div>
						<div class="body">
							<div class="primary">{it.primary}</div>
							{#if it.secondary}<div class="secondary">{it.secondary}</div>{/if}
						</div>
						{#if it.meta}<div class="meta">{it.meta}</div>{/if}
					</div>
				{/each}
			{/if}
		</div>
		<div class="foot">
			<span class="kbd-group"
				><span class="kbd">↑</span><span class="kbd">↓</span><span class="kbd-label"
					>navigate</span
				></span
			>
			<span class="kbd-group"
				><span class="kbd">1</span><span class="kbd">–</span><span class="kbd">9</span><span
					class="kbd-label">jump</span
				></span
			>
			<span class="kbd-group"
				><span class="kbd">↵</span><span class="kbd-label">select</span></span
			>
			{#if showCancelHint}
				<span class="kbd-group" style="margin-left: auto">
					<span class="kbd">esc</span><span class="kbd-label">cancel</span>
				</span>
			{/if}
		</div>
	</div>
</div>
