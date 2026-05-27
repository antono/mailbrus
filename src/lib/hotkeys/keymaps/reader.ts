// openspec/changes/isolate-hotkeys/specs/ui-hotkeys/spec.md (Per-scope hotkey isolation)
import type { Keymap } from '../types.ts';

export type ReaderKeymapCtx = {
	next: () => void;
	prev: () => void;
	open: () => void;
	scrollLineDown: () => void;
	scrollLineUp: () => void;
	pageDown: () => void;
	pageUp: () => void;
	jumpTop: () => void;
	jumpBottom: () => void;
	activateHints: () => void;
	close: () => void;
};

export function createReaderKeymap(ctx: ReaderKeymapCtx): Keymap {
	const prevent = (fn: () => void) => (e: KeyboardEvent) => {
		e.preventDefault();
		fn();
	};
	return {
		scope: 'reader',
		bindings: [
			{ keys: ['j'], group: 'Navigation', description: 'Next message', handler: prevent(ctx.next) },
			{ keys: ['ArrowDown'], group: 'Navigation', description: 'Next message', handler: prevent(ctx.next) },
			{ keys: ['k'], group: 'Navigation', description: 'Previous message', handler: prevent(ctx.prev) },
			{ keys: ['ArrowUp'], group: 'Navigation', description: 'Previous message', handler: prevent(ctx.prev) },
			{ keys: ['Enter'], group: 'Navigation', description: 'Open selected', handler: prevent(ctx.open) },
			{ keys: ['J'], group: 'Scrolling', description: 'Scroll down', handler: prevent(ctx.scrollLineDown) },
			{ keys: ['K'], group: 'Scrolling', description: 'Scroll up', handler: prevent(ctx.scrollLineUp) },
			{ keys: ['PageDown'], group: 'Scrolling', description: 'Scroll page down', handler: prevent(ctx.pageDown) },
			{ keys: ['PageUp'], group: 'Scrolling', description: 'Scroll page up', handler: prevent(ctx.pageUp) },
			{ keys: ['g', 'g'], group: 'Scrolling', description: 'Scroll to top', handler: prevent(ctx.jumpTop) },
			{ keys: ['G'], group: 'Scrolling', description: 'Scroll to bottom', handler: prevent(ctx.jumpBottom) },
			{ keys: ['f'], group: 'Actions', description: 'Follow link / attachment by hint', handler: prevent(ctx.activateHints) },
			{ keys: ['Escape'], group: 'Actions', description: 'Close reader', handler: prevent(ctx.close) }
		]
	};
}
