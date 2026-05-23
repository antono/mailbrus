## Why

E2E tests currently rely on CSS class selectors (`.mb-msg`, `.mb-curtain .mb-row`) and text content, which break when styles are refactored. Zero `data-testid` attributes exist in the codebase. Adding them gives Playwright stable, intent-preserving anchors that survive visual redesigns.

## What Changes

- Add `data-testid` to every interactive element and key scoping container across all 17 Svelte components
- Adopt **hierarchical dot notation**: `{view}.{element}` (e.g. `mail-list.message-row`, `breadcrumbs.home-btn`)
- For repeated items in lists/palettes: same testid per row, scoped with `.nth()` or parent container in tests
- Update `e2e/pages/` page objects to use `getByTestId` where class/text selectors are currently used
- Add a `data-testid` conventions spec

## Capabilities

### New Capabilities
- `data-testid-conventions`: Naming rules, uniqueness scope, list-scoping patterns, and component-by-component testid reference table

### Modified Capabilities
- `sveltekit-ui`: Every UI requirement that describes an interactive element gets the expected `data-testid` value documented

## Impact

- All `.svelte` files in `src/lib/components/` and `src/routes/` (interactive elements + key wrappers)
- `e2e/pages/AccountsPage.ts`, `MailboxPage.ts`, `MessagePage.ts` — selector updates
- No runtime behavior changes; purely additive DOM attributes
