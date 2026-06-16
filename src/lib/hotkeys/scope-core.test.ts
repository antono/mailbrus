// openspec/changes/isolate-hotkeys/specs/ui-hotkeys/spec.md (Active scope and scope stack)
import { assertEquals, assertExists } from 'jsr:@std/assert';
import { pushScopePure, popScopePure, initialStack, BASE_SCOPE } from './scope-core.ts';

Deno.test('initial stack contains only base scope (list)', () => {
	const s = initialStack();
	assertEquals(s, ['list']);
	assertEquals(BASE_SCOPE, 'list');
});

Deno.test('push/pop happy path: reader on top of list', () => {
	const s = initialStack();
	pushScopePure(s, 'reader');
	assertEquals(s, ['list', 'reader']);
	const res = popScopePure(s, 'reader');
	assertEquals(res.popped, true);
	assertEquals(res.error, null);
	assertEquals(s, ['list']);
});

Deno.test('push/pop layered: list -> reader -> hint', () => {
	const s = initialStack();
	pushScopePure(s, 'reader');
	pushScopePure(s, 'hint');
	assertEquals(s, ['list', 'reader', 'hint']);
	assertEquals(popScopePure(s, 'hint').popped, true);
	assertEquals(s, ['list', 'reader']);
});

Deno.test('pop of an absent scope returns error and leaves stack unchanged', () => {
	const s: Array<'list' | 'reader' | 'compose' | 'palette' | 'modal' | 'hint'> = ['list', 'reader'];
	const res = popScopePure(s, 'modal');
	assertEquals(res.popped, false);
	assertExists(res.error);
	assertEquals(s, ['list', 'reader']);
});

Deno.test('layered pop: dismissing the reader under an open palette keeps palette active', () => {
	const s = initialStack();
	pushScopePure(s, 'reader');
	pushScopePure(s, 'palette');
	assertEquals(s, ['list', 'reader', 'palette']);
	// The reader closes while the palette is still on top (e.g. a palette action
	// navigated away). The reader scope is removed from under the palette.
	const res = popScopePure(s, 'reader');
	assertEquals(res.popped, true);
	assertEquals(res.error, null);
	assertEquals(s, ['list', 'palette']);
	// Closing the palette then returns cleanly to the base scope.
	assertEquals(popScopePure(s, 'palette').popped, true);
	assertEquals(s, ['list']);
});

Deno.test('layered pop: closing the palette over a reader returns to reader', () => {
	const s = initialStack();
	pushScopePure(s, 'reader');
	pushScopePure(s, 'palette');
	assertEquals(popScopePure(s, 'palette').popped, true);
	assertEquals(s, ['list', 'reader']);
});

Deno.test('duplicate scopes pop most-recent first (LIFO for same name)', () => {
	const s = initialStack();
	pushScopePure(s, 'modal');
	pushScopePure(s, 'modal');
	assertEquals(s, ['list', 'modal', 'modal']);
	popScopePure(s, 'modal');
	assertEquals(s, ['list', 'modal']);
	popScopePure(s, 'modal');
	assertEquals(s, ['list']);
});

Deno.test('pop on stack-tip returns base scope', () => {
	const s = initialStack();
	pushScopePure(s, 'modal');
	popScopePure(s, 'modal');
	assertEquals(s, ['list']);
});
