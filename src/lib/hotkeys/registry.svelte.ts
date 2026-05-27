// openspec/changes/isolate-hotkeys/specs/ui-hotkeys/spec.md (Keymaps are the single source of help content)
import { untrack } from 'svelte';
import type { Binding, Keymap, KeymapScope, Scope } from './types.ts';
import { activeScope } from './scope.svelte.ts';

const _keymaps = $state<{ value: Keymap[] }>({ value: [] });

// `registerKeymap` is called from `$effect` blocks. Wrap the mutation in
// `untrack` so the enclosing effect does not pick up `_keymaps.value` as a
// reactive dependency and re-run on every registration churn.
export function registerKeymap(km: Keymap): () => void {
	untrack(() => _keymaps.value.push(km));
	return () => {
		untrack(() => {
			const i = _keymaps.value.indexOf(km);
			if (i >= 0) _keymaps.value.splice(i, 1);
		});
	};
}

export function globalBindings(): Binding[] {
	const out: Binding[] = [];
	for (const km of _keymaps.value) {
		if (km.scope === 'global') out.push(...km.bindings);
	}
	return out;
}

export function scopeBindings(scope: Scope): Binding[] {
	const out: Binding[] = [];
	for (const km of _keymaps.value) {
		if (km.scope === scope) out.push(...km.bindings);
	}
	return out;
}

export function activeBindings(): { global: Binding[]; scope: Binding[]; activeScope: Scope } {
	const s = activeScope();
	return { global: globalBindings(), scope: scopeBindings(s), activeScope: s };
}

export function keymapsForScope(scope: KeymapScope): Keymap[] {
	return _keymaps.value.filter((k) => k.scope === scope);
}

export function _resetForTests(): void {
	_keymaps.value.splice(0, _keymaps.value.length);
}
