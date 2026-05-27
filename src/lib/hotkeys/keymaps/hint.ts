// openspec/changes/isolate-hotkeys/specs/ui-hotkeys/spec.md (Per-scope hotkey isolation)
// openspec/specs/vimium-link-hints/spec.md (Escape / unrecognised key cancels)
import type { Binding, Keymap } from '../types.ts';

export type HintKeymapCtx = {
	labels: () => string[];
	activate: (label: string) => void;
	cancel: () => void;
};

export function createHintKeymap(ctx: HintKeymapCtx): Keymap {
	const bindings: Binding[] = [];
	bindings.push({
		keys: ['Escape'],
		group: 'Hint',
		description: 'Cancel hint mode',
		bypassTypingGuard: true,
		handler: (e) => {
			e.preventDefault();
			ctx.cancel();
		}
	});
	bindings.push({
		keys: ['Backspace'],
		group: 'Hint',
		description: 'Cancel hint mode',
		bypassTypingGuard: true,
		handler: (e) => {
			e.preventDefault();
			ctx.cancel();
		}
	});
	// One binding per visible label. The factory runs once on mount; if the active label
	// set changes (different message opened, etc.) the caller re-creates the keymap.
	for (const label of ctx.labels()) {
		bindings.push({
			keys: [label],
			group: 'Hint',
			description: `Activate target ${label}`,
			bypassTypingGuard: true,
			handler: (e) => {
				e.preventDefault();
				ctx.activate(label);
			}
		});
	}
	// Fallback: any other key cancels (per vimium-link-hints spec scenario).
	bindings.push({
		keys: ['*'],
		group: 'Hint',
		description: 'Any other key cancels',
		fallback: true,
		bypassTypingGuard: true,
		handler: (e) => {
			e.preventDefault();
			ctx.cancel();
		}
	});
	return { scope: 'hint', bindings };
}
