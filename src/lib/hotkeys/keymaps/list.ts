// openspec/changes/isolate-hotkeys/specs/ui-hotkeys/spec.md (Per-scope hotkey isolation)
// openspec/changes/hotkeys-improvement/specs/ui-hotkeys/spec.md (g-leader navigation)
import type { Keymap } from '../types.ts';

export type ListKeymapCtx = {
	selectNext: () => void;
	selectPrev: () => void;
	openSelected: () => void;
	jumpTop: () => void;
	jumpBottom: () => void;
	prevPage: () => void;
	nextPage: () => void;
	canPrevPage: () => boolean;
	canNextPage: () => boolean;
	openSearch: () => void;
	openCompose: () => void;
	markRead: () => void;
	markUnread: () => void;
	deleteSelected: () => void;
	goFolderPicker: () => void;
	goAccountPicker: () => void;
	activateHints: () => void;
	escape: () => void;
};

export function createListKeymap(ctx: ListKeymapCtx): Keymap {
	const prevent = (fn: () => void) => (e: KeyboardEvent) => {
		e.preventDefault();
		fn();
	};
	return {
		scope: 'list',
		bindings: [
			{ keys: ['j'], group: 'Navigation', description: 'Next message', handler: prevent(ctx.selectNext) },
			{ keys: ['ArrowDown'], group: 'Navigation', description: 'Next message', handler: prevent(ctx.selectNext) },
			{ keys: ['k'], group: 'Navigation', description: 'Previous message', handler: prevent(ctx.selectPrev) },
			{ keys: ['ArrowUp'], group: 'Navigation', description: 'Previous message', handler: prevent(ctx.selectPrev) },
			{ keys: ['g', 'g'], group: 'Navigation', description: 'Top of list', handler: prevent(ctx.jumpTop) },
			{ keys: ['G'], group: 'Navigation', description: 'Bottom of list', handler: prevent(ctx.jumpBottom) },
			{ keys: ['h'], group: 'Navigation', description: 'Previous page', when: ctx.canPrevPage, handler: prevent(ctx.prevPage) },
			{ keys: ['l'], group: 'Navigation', description: 'Next page', when: ctx.canNextPage, handler: prevent(ctx.nextPage) },
			{ keys: ['Enter'], group: 'Actions', description: 'Open selected message', handler: prevent(ctx.openSelected) },
			{ keys: ['f'], group: 'Actions', description: 'Open message by hint', handler: prevent(ctx.activateHints) },
			{ keys: ['/'], group: 'Actions', description: 'Search this folder', handler: prevent(ctx.openSearch) },
			{ keys: ['c'], group: 'Actions', description: 'Compose new message', handler: prevent(ctx.openCompose) },
			{ keys: ['r'], group: 'Actions', description: 'Mark as read', handler: prevent(ctx.markRead) },
			{ keys: ['u'], group: 'Actions', description: 'Mark as unread', handler: prevent(ctx.markUnread) },
			{ keys: ['d'], group: 'Actions', description: 'Delete', handler: prevent(ctx.deleteSelected) },
			{ keys: ['#'], group: 'Actions', description: 'Delete', handler: prevent(ctx.deleteSelected) },
			{ keys: ['Escape'], group: 'Actions', description: 'Close search / go back', handler: prevent(ctx.escape) },
			{ keys: ['g', 'f'], group: 'Go to', description: 'Folder picker', handler: prevent(ctx.goFolderPicker) },
			{ keys: ['g', 'a'], group: 'Go to', description: 'Account picker', handler: prevent(ctx.goAccountPicker) }
		]
	};
}
