<script lang="ts">
	export interface Tweaks {
		dark: boolean;
		accent: string;
		font: string;
		density: string;
		hintBar: boolean;
	}

	const STORAGE_KEY = 'mailbrus-tweaks';
	const DEFAULTS: Tweaks = {
		dark: false,
		accent: 'indigo',
		font: 'sans',
		density: 'twoline',
		hintBar: true
	};

	function load(): Tweaks {
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
		} catch {}
		return { ...DEFAULTS };
	}

	let { onTweakChange }: { onTweakChange: (t: Tweaks) => void } = $props();

	let t = $state<Tweaks>(load());
	let open = $state(false);
	let panelEl = $state<HTMLDivElement | null>(null);

	$effect(() => {
		try { localStorage.setItem(STORAGE_KEY, JSON.stringify(t)); } catch {}
		onTweakChange({ ...t });
	});

	function set<K extends keyof Tweaks>(key: K, val: Tweaks[K]) {
		t = { ...t, [key]: val };
	}

	// drag state
	let dragOffset = $state({ x: 16, y: 16 });

	function onDragStart(e: MouseEvent) {
		const panel = panelEl;
		if (!panel) return;
		const r = panel.getBoundingClientRect();
		const sx = e.clientX, sy = e.clientY;
		const startRight = window.innerWidth - r.right;
		const startBottom = window.innerHeight - r.bottom;
		const move = (ev: MouseEvent) => {
			dragOffset = {
				x: Math.max(16, startRight - (ev.clientX - sx)),
				y: Math.max(16, startBottom - (ev.clientY - sy))
			};
		};
		const up = () => {
			window.removeEventListener('mousemove', move);
			window.removeEventListener('mouseup', up);
		};
		window.addEventListener('mousemove', move);
		window.addEventListener('mouseup', up);
	}

	const ACCENT_LABELS: Record<string, string> = {
		indigo: 'Indigo', violet: 'Violet', blue: 'Blue',
		green: 'Green', rose: 'Rose', amber: 'Amber', mono: 'Mono'
	};
	const ACCENTS = ['indigo', 'violet', 'blue', 'green', 'rose', 'amber', 'mono'];
	const FONTS = ['sans', 'mono', 'serif'];
	const DENSITIES = ['dense', 'twoline', 'spacious'];
</script>

<!-- Toggle button — always visible -->
<button
	type="button"
	class="twk-fab"
	onclick={() => (open = !open)}
	aria-label="Toggle tweaks panel"
>⚙</button>

{#if open}
	<div
		bind:this={panelEl}
		class="twk-panel"
		style="right: {dragOffset.x}px; bottom: {dragOffset.y}px"
		data-noncommentable=""
	>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="twk-hd" onmousedown={onDragStart}>
			<b>Tweaks</b>
			<button class="twk-x" aria-label="Close tweaks" onmousedown={(e) => e.stopPropagation()} onclick={() => (open = false)}>✕</button>
		</div>
		<div class="twk-body">
			<div class="twk-sect">Theme</div>
			<div class="twk-row twk-row-h">
				<div class="twk-lbl"><span>Dark mode</span></div>
				<button type="button" class="twk-toggle" data-on={t.dark ? '1' : '0'} role="switch" aria-checked={t.dark} onclick={() => set('dark', !t.dark)}><i></i></button>
			</div>
			<div class="twk-row">
				<div class="twk-lbl"><span>Accent</span></div>
				<select class="twk-field" value={t.accent} onchange={(e) => set('accent', (e.target as HTMLSelectElement).value)}>
					{#each ACCENTS as a}
						<option value={a}>{ACCENT_LABELS[a]}</option>
					{/each}
				</select>
			</div>
			<div class="twk-sect">Typography</div>
			<div class="twk-row">
				<div class="twk-lbl"><span>Font</span></div>
				<div class="twk-seg">
					<div class="twk-seg-thumb" style="left: calc(2px + {FONTS.indexOf(t.font)} * (100% - 4px) / {FONTS.length}); width: calc((100% - 4px) / {FONTS.length})"></div>
					{#each FONTS as f}
						<button type="button" role="radio" aria-checked={t.font === f} onclick={() => set('font', f)}>{f}</button>
					{/each}
				</div>
			</div>
			<div class="twk-sect">Layout</div>
			<div class="twk-row">
				<div class="twk-lbl"><span>Density</span></div>
				<div class="twk-seg">
					<div class="twk-seg-thumb" style="left: calc(2px + {DENSITIES.indexOf(t.density)} * (100% - 4px) / {DENSITIES.length}); width: calc((100% - 4px) / {DENSITIES.length})"></div>
					{#each DENSITIES as d}
						<button type="button" role="radio" aria-checked={t.density === d} onclick={() => set('density', d)}>{d}</button>
					{/each}
				</div>
			</div>
			<div class="twk-row twk-row-h">
				<div class="twk-lbl"><span>Show key hints</span></div>
				<button type="button" class="twk-toggle" data-on={t.hintBar ? '1' : '0'} role="switch" aria-checked={t.hintBar} onclick={() => set('hintBar', !t.hintBar)}><i></i></button>
			</div>
		</div>
	</div>
{/if}

<style>
	.twk-fab {
		position: fixed;
		right: 16px;
		bottom: 16px;
		z-index: 2147483645;
		width: 32px;
		height: 32px;
		border-radius: 50%;
		border: 1px solid rgba(0,0,0,.12);
		background: rgba(250,249,247,.9);
		color: rgba(41,38,27,.7);
		font-size: 14px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0 2px 8px rgba(0,0,0,.12);
		backdrop-filter: blur(8px);
	}
	.twk-fab:hover { background: rgba(250,249,247,1); color: rgba(41,38,27,1); }
	:global(.twk-panel) {
		position: fixed;
		z-index: 2147483646;
		width: 280px;
		max-height: calc(100vh - 32px);
		display: flex;
		flex-direction: column;
		background: rgba(250,249,247,.88);
		color: #29261b;
		-webkit-backdrop-filter: blur(24px) saturate(160%);
		backdrop-filter: blur(24px) saturate(160%);
		border: .5px solid rgba(255,255,255,.6);
		border-radius: 14px;
		box-shadow: 0 1px 0 rgba(255,255,255,.5) inset, 0 12px 40px rgba(0,0,0,.18);
		font: 11.5px/1.4 ui-sans-serif, system-ui, -apple-system, sans-serif;
		overflow: hidden;
	}
	:global(.twk-hd) {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 8px 10px 14px;
		cursor: move;
		user-select: none;
	}
	:global(.twk-hd b) { font-size: 12px; font-weight: 600; letter-spacing: .01em; }
	:global(.twk-x) {
		appearance: none; border: 0; background: transparent;
		color: rgba(41,38,27,.55); width: 22px; height: 22px;
		border-radius: 6px; cursor: default; font-size: 13px; line-height: 1;
	}
	:global(.twk-x:hover) { background: rgba(0,0,0,.06); color: #29261b; }
	:global(.twk-body) {
		padding: 2px 14px 14px;
		display: flex;
		flex-direction: column;
		gap: 10px;
		overflow-y: auto;
		overflow-x: hidden;
		min-height: 0;
		scrollbar-width: thin;
		scrollbar-color: rgba(0,0,0,.15) transparent;
	}
	:global(.twk-sect) {
		font-size: 10px; font-weight: 600; letter-spacing: .06em;
		text-transform: uppercase; color: rgba(41,38,27,.45); padding: 10px 0 0;
	}
	:global(.twk-sect:first-child) { padding-top: 0; }
	:global(.twk-row) { display: flex; flex-direction: column; gap: 5px; }
	:global(.twk-row-h) { flex-direction: row; align-items: center; justify-content: space-between; gap: 10px; }
	:global(.twk-lbl) { display: flex; justify-content: space-between; align-items: baseline; color: rgba(41,38,27,.72); }
	:global(.twk-lbl > span:first-child) { font-weight: 500; }
	:global(.twk-field) {
		appearance: none; box-sizing: border-box; width: 100%; min-width: 0;
		height: 26px; padding: 0 8px; border: .5px solid rgba(0,0,0,.1);
		border-radius: 7px; background: rgba(255,255,255,.6); color: inherit;
		font: inherit; outline: none;
	}
	:global(select.twk-field) { padding-right: 22px; }
	:global(.twk-seg) {
		position: relative; display: flex; padding: 2px; border-radius: 8px;
		background: rgba(0,0,0,.06); user-select: none;
	}
	:global(.twk-seg-thumb) {
		position: absolute; top: 2px; bottom: 2px; border-radius: 6px;
		background: rgba(255,255,255,.9); box-shadow: 0 1px 2px rgba(0,0,0,.12);
		transition: left .15s cubic-bezier(.3,.7,.4,1), width .15s;
	}
	:global(.twk-seg button) {
		appearance: none; position: relative; z-index: 1; flex: 1; border: 0;
		background: transparent; color: inherit; font: inherit; font-weight: 500;
		min-height: 22px; border-radius: 6px; cursor: default;
		padding: 4px 6px; line-height: 1.2;
	}
	:global(.twk-toggle) {
		position: relative; width: 32px; height: 18px; border: 0;
		border-radius: 999px; background: rgba(0,0,0,.15);
		transition: background .15s; cursor: default; padding: 0;
	}
	:global(.twk-toggle[data-on="1"]) { background: #34c759; }
	:global(.twk-toggle i) {
		position: absolute; top: 2px; left: 2px; width: 14px; height: 14px;
		border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.25);
		transition: transform .15s;
	}
	:global(.twk-toggle[data-on="1"] i) { transform: translateX(14px); }
</style>
