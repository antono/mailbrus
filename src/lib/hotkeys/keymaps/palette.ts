// openspec/changes/isolate-hotkeys/specs/ui-hotkeys/spec.md (Per-scope hotkey isolation)
import type { Keymap } from '../types.ts';

export type PaletteKeymapCtx = {
	moveDown: () => void;
	moveUp: () => void;
	confirm: () => void;
	cancel: () => void;
	jumpTo: (n: number) => void;
	isQueryEmpty: () => boolean;
};

export function createPaletteKeymap(ctx: PaletteKeymapCtx): Keymap {
	const prevent = (fn: () => void) => (e: KeyboardEvent) => {
		e.preventDefault();
		fn();
	};
	const numHandler = (n: number) => (e: KeyboardEvent) => {
		e.preventDefault();
		ctx.jumpTo(n);
	};
	const isEmpty = () => ctx.isQueryEmpty();

	const bindings = [
		{ keys: ['ArrowDown'], group: 'Navigate', description: 'Move down', bypassTypingGuard: true, handler: prevent(ctx.moveDown) },
		{ keys: ['ArrowUp'], group: 'Navigate', description: 'Move up', bypassTypingGuard: true, handler: prevent(ctx.moveUp) },
		{ keys: ['Ctrl+N'], group: 'Navigate', description: 'Move down', handler: prevent(ctx.moveDown) },
		{ keys: ['Ctrl+P'], group: 'Navigate', description: 'Move up', handler: prevent(ctx.moveUp) },
		{ keys: ['j'], group: 'Navigate', description: 'Move down (when query empty)', when: isEmpty, bypassTypingGuard: true, handler: prevent(ctx.moveDown) },
		{ keys: ['k'], group: 'Navigate', description: 'Move up (when query empty)', when: isEmpty, bypassTypingGuard: true, handler: prevent(ctx.moveUp) },
		{ keys: ['Enter'], group: 'Actions', description: 'Confirm selection', bypassTypingGuard: true, handler: prevent(ctx.confirm) },
		{ keys: ['Escape'], group: 'Actions', description: 'Cancel', handler: prevent(ctx.cancel) }
	];
	for (let n = 1; n <= 9; n++) {
		bindings.push({
			keys: [String(n)],
			group: 'Jump',
			description: `Jump to row ${n} (when query empty)`,
			when: isEmpty,
			bypassTypingGuard: true,
			handler: numHandler(n - 1)
		});
	}
	return { scope: 'palette', bindings };
}
