// openspec/changes/isolate-hotkeys/specs/ui-hotkeys/spec.md (Active scope and scope stack)
import type { Scope } from './types.ts';

export type PopResult = { popped: boolean; error: string | null };

export function pushScopePure(stack: Scope[], s: Scope): void {
	stack.push(s);
}

export function popScopePure(stack: Scope[], s: Scope): PopResult {
	const top = stack[stack.length - 1];
	if (top !== s) {
		const msg = `popScope mismatch: expected '${s}' on top, found '${top ?? '(empty)'}' (stack: ${stack.join(', ')})`;
		return { popped: false, error: msg };
	}
	stack.pop();
	return { popped: true, error: null };
}

export const BASE_SCOPE: Scope = 'list';

export function initialStack(): Scope[] {
	return [BASE_SCOPE];
}
