// openspec/changes/isolate-hotkeys/specs/ui-hotkeys/spec.md
// (Per-scope hotkey isolation, Typing guard, Global keymap)
import { assertEquals } from 'jsr:@std/assert';
import type { Binding } from './types.ts';
import {
	hasModifier,
	bypassesTypingGuard,
	matchSingleKey,
	pickMatch,
	findLeaderStart,
	filterByTypingGuard,
	type EventLike
} from './dispatcher-core.ts';

function ev(key: string, mods: Partial<Pick<EventLike, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>> = {}): EventLike {
	return {
		key,
		ctrlKey: mods.ctrlKey ?? false,
		metaKey: mods.metaKey ?? false,
		altKey: mods.altKey ?? false,
		shiftKey: mods.shiftKey ?? false
	};
}

function bind(keys: string[], handler: () => void = () => {}, opts: Partial<Binding> = {}): Binding {
	return {
		keys,
		group: 'test',
		description: keys.join(' '),
		handler,
		...opts
	};
}

Deno.test('hasModifier recognises Ctrl/Meta/Cmd/Alt/Shift prefixes', () => {
	assertEquals(hasModifier('Ctrl+K'), true);
	assertEquals(hasModifier('Meta+,'), true);
	assertEquals(hasModifier('Cmd+S'), true);
	assertEquals(hasModifier('Shift+G'), true);
	assertEquals(hasModifier('Alt+Tab'), true);
	assertEquals(hasModifier('j'), false);
	assertEquals(hasModifier('Escape'), false);
	assertEquals(hasModifier('?'), false);
});

Deno.test('bypassesTypingGuard: modifier combos and Escape only', () => {
	assertEquals(bypassesTypingGuard('Ctrl+K'), true);
	assertEquals(bypassesTypingGuard('Ctrl+Enter'), true);
	assertEquals(bypassesTypingGuard('Escape'), true);
	assertEquals(bypassesTypingGuard('j'), false);
	assertEquals(bypassesTypingGuard('?'), false);
	assertEquals(bypassesTypingGuard('Enter'), false);
});

Deno.test('matchSingleKey: plain key requires no modifiers', () => {
	assertEquals(matchSingleKey('j', ev('j')), true);
	assertEquals(matchSingleKey('j', ev('j', { ctrlKey: true })), false);
	assertEquals(matchSingleKey('?', ev('?')), true);
});

Deno.test('matchSingleKey: Ctrl+K matches Ctrl or Meta', () => {
	assertEquals(matchSingleKey('Ctrl+K', ev('k', { ctrlKey: true })), true);
	assertEquals(matchSingleKey('Ctrl+K', ev('K', { metaKey: true })), true);
	assertEquals(matchSingleKey('Ctrl+K', ev('k')), false);
});

Deno.test('matchSingleKey: special keys', () => {
	assertEquals(matchSingleKey('Escape', ev('Escape')), true);
	assertEquals(matchSingleKey('ArrowDown', ev('ArrowDown')), true);
	assertEquals(matchSingleKey('Enter', ev('Enter')), true);
});

Deno.test('filterByTypingGuard: skips plain-key bindings when typing', () => {
	const bindings = [bind(['j']), bind(['Ctrl+K']), bind(['Escape']), bind(['?'])];
	const filtered = filterByTypingGuard(bindings, true);
	assertEquals(filtered.length, 2);
	assertEquals(filtered[0].keys[0], 'Ctrl+K');
	assertEquals(filtered[1].keys[0], 'Escape');
});

Deno.test('filterByTypingGuard: passes everything through when not typing', () => {
	const bindings = [bind(['j']), bind(['Ctrl+K'])];
	assertEquals(filterByTypingGuard(bindings, false).length, 2);
});

Deno.test('pickMatch: single-key binding with no leader fires', () => {
	let fired = 0;
	const b = bind(['j'], () => { fired++; });
	const m = pickMatch([b], ev('j'), null);
	assertEquals(m?.binding, b);
	assertEquals(m?.consumesLeader, false);
	m!.binding.handler({} as KeyboardEvent);
	assertEquals(fired, 1);
});

Deno.test('pickMatch: single-key bindings skipped while leader is pending', () => {
	const b = bind(['j']);
	const m = pickMatch([b], ev('j'), 'g');
	assertEquals(m, null);
});

Deno.test('pickMatch: leader-sequence fires when prefix + key match', () => {
	const b = bind(['g', 'i']);
	const m = pickMatch([b], ev('i'), 'g');
	assertEquals(m?.binding, b);
	assertEquals(m?.consumesLeader, true);
});

Deno.test('pickMatch: leader-sequence does not match wrong follow-up', () => {
	const b = bind(['g', 'i']);
	assertEquals(pickMatch([b], ev('x'), 'g'), null);
});

Deno.test('pickMatch: when() gate filters out the binding', () => {
	const b = bind(['j'], () => {}, { when: () => false });
	assertEquals(pickMatch([b], ev('j'), null), null);
});

Deno.test('findLeaderStart: true when first key of 2-key sequence matches', () => {
	const bindings = [bind(['g', 'g']), bind(['g', 'i'])];
	assertEquals(findLeaderStart(bindings, ev('g')), true);
	assertEquals(findLeaderStart(bindings, ev('j')), false);
});

Deno.test('findLeaderStart: false when modifier pressed', () => {
	const bindings = [bind(['g', 'g'])];
	assertEquals(findLeaderStart(bindings, ev('g', { ctrlKey: true })), false);
});

Deno.test('matchSingleKey: uppercase letter spec matches Shift+letter event', () => {
	// Reproduces the `g A` regression: the second-key match for an uppercase
	// letter must succeed against an event with shiftKey=true and key='A'.
	assertEquals(matchSingleKey('A', ev('A', { shiftKey: true })), true);
});

Deno.test('pickMatch: leader sequence still wins when only one scope holds it', () => {
	// Reproduces the bug where the dispatcher cancelled a pending leader after
	// checking the global set (no `g g` there), preventing the scope-level `g g`
	// from ever firing. Pure-logic check: the 2-key binding must be found via
	// pickMatch when leader is set, regardless of which scope it lives in.
	const globalOnly = [bind(['Ctrl+K']), bind(['?'])];
	const scopeWithSequence = [bind(['j']), bind(['g', 'g'])];

	assertEquals(pickMatch(globalOnly, ev('g'), 'g'), null);
	const m = pickMatch(scopeWithSequence, ev('g'), 'g');
	assertEquals(m?.binding.keys.join(' '), 'g g');
	assertEquals(m?.consumesLeader, true);
});

Deno.test('pickMatch: fallback binding fires when nothing else matches', () => {
	const a = bind(['a']);
	const fb = bind(['*'], () => {}, { fallback: true });
	const m = pickMatch([a, fb], ev('x'), null);
	assertEquals(m?.binding, fb);
	const m2 = pickMatch([a, fb], ev('a'), null);
	assertEquals(m2?.binding, a);
});

Deno.test('exclusive scope behavior: typing-guard + Ctrl+Enter still matches in input', () => {
	const send = bind(['Ctrl+Enter']);
	const filtered = filterByTypingGuard([send], true);
	assertEquals(filtered.length, 1);
	assertEquals(matchSingleKey(filtered[0].keys[0], ev('Enter', { ctrlKey: true })), true);
});
