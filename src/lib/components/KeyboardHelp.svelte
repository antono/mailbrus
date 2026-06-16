<script lang="ts">
	import Wordmark from './Wordmark.svelte';
	// openspec/changes/isolate-hotkeys/specs/ui-hotkeys/spec.md
	// — Keymaps are the single source of help content
	// — Keyboard help toggle (Global + active scope only)
	import { scopeStack } from '$lib/hotkeys/scope.svelte.ts';
	import { globalBindings, scopeBindings } from '$lib/hotkeys/registry.svelte.ts';
	import { useScopedKeymap } from '$lib/hotkeys/scope-bind.svelte.ts';
	import { createModalKeymap } from '$lib/hotkeys/keymaps/modal.ts';
	import type { Binding, Scope } from '$lib/hotkeys/types.ts';

	let { onClose }: { onClose: () => void } = $props();

	useScopedKeymap('modal', () => createModalKeymap({ close: onClose }));

	const SCOPE_LABEL: Record<Scope, string> = {
		list: 'List',
		reader: 'Reader',
		compose: 'Compose',
		palette: 'Palette',
		modal: 'Modal',
		hint: 'Hint'
	};

	// The scope underneath this modal — that's the "view" the user was in when they pressed `?`.
	const hostScope = $derived.by(() => {
		const stack = scopeStack();
		for (let i = stack.length - 1; i >= 0; i--) {
			if (stack[i] !== 'modal') return stack[i];
		}
		return 'list' as Scope;
	});

	type Row = { keys: string[][]; description: string };
	type Section = { label: string; rows: Row[] };

	function asKeyParts(spec: string): string[] {
		// Split modifier combos like 'Ctrl+K' into ['Ctrl', 'K']; leave single keys as ['j'].
		return spec.includes('+') ? spec.split('+') : [spec];
	}

	function bucket(bindings: Binding[]): Section[] {
		// Skip fallback / wildcard bindings — they are dispatch-only, not user-facing help rows.
		const visible = bindings.filter((b) => !b.fallback && !b.keys.includes('*'));
		const byGroup = new Map<string, Map<string, Row>>();
		for (const b of visible) {
			let groupMap = byGroup.get(b.group);
			if (!groupMap) {
				groupMap = new Map();
				byGroup.set(b.group, groupMap);
			}
			const existing = groupMap.get(b.description);
			const keyParts = b.keys.map(asKeyParts);
			if (existing) {
				// Merge alternative keys for bindings sharing a description (e.g. j and ArrowDown).
				existing.keys.push(...keyParts);
			} else {
				groupMap.set(b.description, { keys: keyParts, description: b.description });
			}
		}
		return Array.from(byGroup.entries()).map(([label, m]) => ({
			label,
			rows: Array.from(m.values())
		}));
	}

	const globalSection = $derived<Section>({
		label: 'Global',
		rows: bucket(globalBindings()).flatMap((s) => s.rows)
	});

	const scopeSections = $derived<Section[]>(bucket(scopeBindings(hostScope)));
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="mb-curtain"
	onclick={(e) => { if ((e.target as HTMLElement).classList.contains('mb-curtain')) onClose(); }}
>
	<div class="mb-help" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" data-testid="keyboard-help.dialog">
		<div class="head">
			<div class="eyebrow">
				<span>keyboard shortcuts</span>
				<Wordmark size={11} />
			</div>
			<div class="title" data-testid="keyboard-help.scope-title">{SCOPE_LABEL[hostScope]}</div>
		</div>
		<div class="mb-help-grid mb-scroll">
			<div class="mb-help-sect" data-testid="keyboard-help.section-global">
				<div class="mb-help-sect-label">{globalSection.label}</div>
				<div class="mb-help-rows">
					{#each globalSection.rows as row}
						<div class="mb-help-row">
							<div class="mb-help-keys">
								{#each row.keys as grp}
									<span class="mb-help-keygroup">
										{#each grp as k}
											<span class="kbd">{k}</span>
										{/each}
									</span>
								{/each}
							</div>
							<div class="mb-help-desc">{row.description}</div>
						</div>
					{/each}
				</div>
			</div>
			{#each scopeSections as section}
				<div class="mb-help-sect" data-testid="keyboard-help.section-scope">
					<div class="mb-help-sect-label">{section.label}</div>
					<div class="mb-help-rows">
						{#each section.rows as row}
							<div class="mb-help-row">
								<div class="mb-help-keys">
									{#each row.keys as grp}
										<span class="mb-help-keygroup">
											{#each grp as k}
												<span class="kbd">{k}</span>
											{/each}
										</span>
									{/each}
								</div>
								<div class="mb-help-desc">{row.description}</div>
							</div>
						{/each}
					</div>
				</div>
			{/each}
		</div>
		<div class="foot">
			<span class="kbd-group"><span class="kbd">?</span><span class="kbd-label">toggle</span></span>
			<span class="kbd-group" style="margin-left: auto">
				<span class="kbd">esc</span><span class="kbd-label">close</span>
			</span>
		</div>
	</div>
</div>
