// openspec/changes/isolate-hotkeys/specs/ui-hotkeys/spec.md (Per-scope hotkey isolation)
import type { Keymap } from '../types.ts';

export type ComposeKeymapCtx = {
	send: () => void;
	saveDraft: () => void;
	escape: () => void;
};

export function createComposeKeymap(ctx: ComposeKeymapCtx): Keymap {
	const prevent = (fn: () => void) => (e: KeyboardEvent) => {
		e.preventDefault();
		fn();
	};
	return {
		scope: 'compose',
		bindings: [
			{ keys: ['Ctrl+Enter'], group: 'Compose', description: 'Send', handler: prevent(ctx.send) },
			{ keys: ['Ctrl+S'], group: 'Compose', description: 'Save draft', handler: prevent(ctx.saveDraft) },
			{ keys: ['Escape'], group: 'Compose', description: 'Discard', handler: prevent(ctx.escape) }
		]
	};
}
