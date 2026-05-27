// openspec/changes/isolate-hotkeys/specs/ui-hotkeys/spec.md (Active scope and scope stack)
import { untrack } from 'svelte';
import type { Scope } from './types.ts';
import { pushScopePure, popScopePure, initialStack } from './scope-core.ts';

const _stack = $state<{ value: Scope[] }>({ value: initialStack() });

export function scopeStack(): readonly Scope[] {
	return _stack.value;
}

export function activeScope(): Scope {
	return _stack.value[_stack.value.length - 1];
}

// `pushScope` / `popScope` are mutators, but the underlying read of `_stack.value`
// would otherwise be tracked by any enclosing `$effect`, causing the effect to
// re-run every time the stack mutates and create an infinite push/pop loop.
// Wrap the mutation in `untrack` so the caller's reactive subscription set is
// not extended.
export function pushScope(s: Scope): void {
	untrack(() => pushScopePure(_stack.value, s));
}

export function popScope(s: Scope): void {
	const res = untrack(() => popScopePure(_stack.value, s));
	if (!res.popped) {
		if (import.meta.env.DEV) throw new Error(res.error!);
		console.error(res.error);
	}
}

export function _resetForTests(): void {
	untrack(() => _stack.value.splice(0, _stack.value.length, ...initialStack()));
}
