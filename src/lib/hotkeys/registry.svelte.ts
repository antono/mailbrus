// openspec/changes/isolate-hotkeys/specs/ui-hotkeys/spec.md (Keymaps are the single source of help content)
import { untrack } from 'svelte';
import type { Binding, Keymap, KeymapScope, Scope } from './types.ts';
import { activeScope } from './scope.svelte.ts';

// Storage is a plain (non-reactive, non-proxied) array, mutated in place. This
// avoids two bugs that surface when several scoped components mount/unmount in
// one reactive flush:
//   1. A deeply-reactive `$state` array proxies each pushed keymap, so removal
//      by identity (`indexOf`) never matches and keymaps leak.
//   2. A `$state.raw` array reassigned with `[...x, km]` / `x.filter(...)` loses
//      updates when a register and a dispose run in the same flush — each reads
//      the pre-flush snapshot, so the later write clobbers the earlier one (a
//      freshly registered keymap could be dropped by an unrelated dispose).
// In-place `push`/`splice` on one stable array is immediately visible to every
// interleaved effect and preserves object identity. A separate `$state` version
// counter notifies reactive readers (the keyboard-help dialog) on every change.
const _keymaps: Keymap[] = [];
const _version = $state({ n: 0 });

// Bump the version without subscribing the caller (registration happens inside
// component `$effect`s; reading the version there would re-run them in a loop).
function bump(): void {
	untrack(() => {
		_version.n += 1;
	});
}

// Read the version so reactive callers (e.g. the help dialog) re-evaluate when
// keymaps change; harmless when called from the non-reactive dispatcher.
function track(): void {
	void _version.n;
}

export function registerKeymap(km: Keymap): () => void {
	_keymaps.push(km);
	bump();
	return () => {
		const i = _keymaps.indexOf(km);
		if (i >= 0) _keymaps.splice(i, 1);
		bump();
	};
}

export function globalBindings(): Binding[] {
	track();
	const out: Binding[] = [];
	for (const km of _keymaps) {
		if (km.scope === 'global') out.push(...km.bindings);
	}
	return out;
}

export function scopeBindings(scope: Scope): Binding[] {
	track();
	const out: Binding[] = [];
	for (const km of _keymaps) {
		if (km.scope === scope) out.push(...km.bindings);
	}
	return out;
}

export function activeBindings(): { global: Binding[]; scope: Binding[]; activeScope: Scope } {
	const s = activeScope();
	return { global: globalBindings(), scope: scopeBindings(s), activeScope: s };
}

export function keymapsForScope(scope: KeymapScope): Keymap[] {
	track();
	return _keymaps.filter((k) => k.scope === scope);
}

export function _resetForTests(): void {
	_keymaps.length = 0;
	bump();
}
