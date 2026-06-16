// openspec/changes/isolate-hotkeys/specs/ui-hotkeys/spec.md (Active scope and scope stack)
import type { Scope } from './types.ts';

export type PopResult = { popped: boolean; error: string | null };

export function pushScopePure(stack: Scope[], s: Scope): void {
	stack.push(s);
}

export function popScopePure(stack: Scope[], s: Scope): PopResult {
	// Remove the most-recent occurrence of `s` wherever it sits, not only the
	// top. Scoped views can layer (e.g. the command palette opens over the
	// reader -> ['list', 'reader', 'palette']) and a palette action may dismiss
	// the underlying reader, so the reader pops while `palette` is still on top.
	// Removing by identity keeps the active scope (stack tip) correct and avoids
	// leaving a stale scope behind. A genuinely bogus pop (scope never pushed)
	// still fails loudly.
	const idx = stack.lastIndexOf(s);
	if (idx === -1) {
		const top = stack[stack.length - 1];
		const msg = `popScope mismatch: '${s}' is not on the stack (top: '${top ?? '(empty)'}', stack: ${stack.join(', ')})`;
		return { popped: false, error: msg };
	}
	stack.splice(idx, 1);
	return { popped: true, error: null };
}

export const BASE_SCOPE: Scope = 'list';

export function initialStack(): Scope[] {
	return [BASE_SCOPE];
}
