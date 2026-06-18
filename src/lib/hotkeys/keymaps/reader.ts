// openspec/changes/isolate-hotkeys/specs/ui-hotkeys/spec.md (Per-scope hotkey isolation)
// openspec/changes/hotkeys-improvement/specs/ui-hotkeys/spec.md (Reader message-action keys)
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
	reply: () => void;
	replyAll: () => void;
	forward: () => void;
	yankBody: () => void;
	yankHeaders: () => void;
	toggleHeaders: () => void;
	goFolderPicker: () => void;
	goAccountPicker: () => void;
	close: () => void;
	quit: () => void;
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
			{ keys: ['r'], group: 'Actions', description: 'Reply to sender', handler: prevent(ctx.reply) },
			{ keys: ['R'], group: 'Actions', description: 'Reply to all', handler: prevent(ctx.replyAll) },
			{ keys: ['F'], group: 'Actions', description: 'Forward message', handler: prevent(ctx.forward) },
			{ keys: ['y'], group: 'Actions', description: 'Yank (copy) body', handler: prevent(ctx.yankBody) },
			{ keys: ['Y'], group: 'Actions', description: 'Yank body with headers', handler: prevent(ctx.yankHeaders) },
			{ keys: ['g', 'h'], group: 'Actions', description: 'Toggle headers menu', handler: prevent(ctx.toggleHeaders) },
			{ keys: ['f'], group: 'Actions', description: 'Follow link / attachment by hint', handler: prevent(ctx.activateHints) },
			{ keys: ['g', 'f'], group: 'Go to', description: 'Folder picker', handler: prevent(ctx.goFolderPicker) },
			{ keys: ['g', 'a'], group: 'Go to', description: 'Account picker', handler: prevent(ctx.goAccountPicker) },
			{ keys: ['q'], group: 'Actions', description: 'Quit to list', handler: prevent(ctx.quit) },
			{ keys: ['Escape'], group: 'Actions', description: 'Close reader', handler: prevent(ctx.close) }
		]
	};
}
