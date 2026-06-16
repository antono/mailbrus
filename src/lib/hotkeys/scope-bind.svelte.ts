// openspec/changes/isolate-hotkeys/specs/ui-hotkeys/spec.md (Active scope and scope stack)
import { untrack } from 'svelte';
import { pushScope, popScope } from './scope.svelte.ts';
import { registerKeymap } from './registry.svelte.ts';
import type { Keymap, Scope } from './types.ts';

/**
 * Bind a scope and its keymap to the calling component's lifetime: push the
 * scope and register the keymap exactly once on mount, pop and dispose exactly
 * once on unmount.
 *
 * The keymap factory is invoked inside `untrack`, so reading handler props
 * (which are typically inline arrows whose identity changes on every parent
 * render) does NOT make this effect reactive. Without that, the effect would
 * re-run on every parent render and execute `popScope` + `pushScope` each time;
 * while another scope is layered above this one (e.g. a palette or hint mode
 * over the reader) that pop+push reorders the stack — the re-pushed scope lands
 * above the layered one, or a scope is left stranded after teardown — so
 * `activeScope()` no longer matches the visible surface. The visible symptom is
 * that keyboard shortcuts (which are scope-gated) stop firing while mouse
 * clicks (which are not) keep working.
 *
 * The captured handler closures reference the parent's reactive signals, so
 * invoking them later still reads live state — registering once is safe.
 */
export function useScopedKeymap(scope: Scope, makeKeymap: () => Keymap): void {
	$effect(() => {
		pushScope(scope);
		const dispose = registerKeymap(untrack(makeKeymap));
		return () => {
			dispose();
			popScope(scope);
		};
	});
}
