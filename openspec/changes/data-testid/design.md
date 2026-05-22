## Context

Zero `data-testid` attributes exist in Mailbrus. E2E page objects use CSS class selectors (`.mb-msg`, `.mb-curtain .mb-row`) and `getByText()` — both break on style refactors or copy changes. Palette is a shared component reused by AccountPicker, FolderPicker, and CommandPalette, creating a repeated-row problem.

## Goals / Non-Goals

**Goals:**
- Every interactive element and key scoping container has a `data-testid`
- Testids are unique within a single view/page
- Palette rows are selectable without ambiguity using container scoping
- Page objects updated to use `getByTestId` where applicable
- Naming convention documented in a spec

**Non-Goals:**
- Changing any visible behavior or accessibility attributes
- Adding testids to purely decorative/display elements (Avatar, Paperclip, Wordmark)
- Automated linting/enforcement of naming (future work)

## Decisions

### D1: Naming convention — hierarchical dot notation `{view}.{element}`

`view` = the logical screen region (matches component name in kebab-case).
`element` = the role/purpose of the element, suffixed with `-btn`, `-input`, `-row`, `-curtain`.

Examples: `breadcrumbs.home-btn`, `mail-list.message-row`, `tweaks.dark-toggle`.

**Alternatives considered:**
- kebab-case flat (`mail-list-message-row`) — harder to grep by view, no scoping signal
- BEM (`mail-list__message-row`) — unfamiliar in test contexts, visually noisy

### D2: Palette scoping — wrapper provides curtain testid, rows stay `palette.row`

Palette is a dumb shared component. The three wrapper components (AccountPicker, FolderPicker, CommandPalette) each pass a `curtainTestId` prop that Palette sets on its curtain `<div>`. Rows always get `data-testid="palette.row"`. Tests scope to the curtain first:

```ts
const picker = page.getByTestId('accounts.curtain');
await picker.getByTestId('palette.row').nth(0).click();
```

**Alternatives considered:**
- Per-wrapper row testids (`accounts.row`) via a `rowTestId` prop — more props, same scoping needed anyway
- Embed key in testid (`palette.row:alice@example.com`) — brittle with special chars and long names

### D3: Interactive element vs wrapper placement

`data-testid` goes on the **interactive element** (button, input, select) for direct actions.
`data-testid` goes on a **wrapper** only when it is a scoping container (dialog, panel, list).
Both may coexist: a dialog has a wrapper testid for existence assertions and a close-btn testid for clicking.

### D4: Page object migration strategy — additive, not rewrite

Existing selectors in page objects are left in place. New `getByTestId` helpers are added alongside. This avoids breaking currently-passing tests during the migration.

## Complete testid reference

### breadcrumbs
| Element | `data-testid` |
|---|---|
| Home / wordmark button | `breadcrumbs.home-btn` |
| Account button | `breadcrumbs.account-btn` |
| Folder button | `breadcrumbs.folder-btn` |

### mail-list
| Element | `data-testid` |
|---|---|
| List container | `mail-list.container` |
| Message row (repeated) | `mail-list.message-row` |
| Search input | `mail-list.search-input` |
| Previous page button | `mail-list.prev-btn` |
| Next page button | `mail-list.next-btn` |

### palette (shared)
| Element | `data-testid` |
|---|---|
| Curtain / dialog (set by wrapper via prop) | `accounts.curtain` / `folders.curtain` / `commands.curtain` |
| Filter input | `palette.input` |
| Row (repeated) | `palette.row` |

### reader
| Element | `data-testid` |
|---|---|
| Reader container | `reader.container` |
| Headers toggle button | `reader.headers-btn` |
| Unsubscribe button | `reader.unsubscribe-btn` |

### compose
| Element | `data-testid` |
|---|---|
| Compose container | `compose.container` |
| To input | `compose.to-input` |
| Subject input | `compose.subject-input` |
| Body textarea | `compose.body` |
| Add Cc button | `compose.add-cc-btn` |
| Add Bcc button | `compose.add-bcc-btn` |
| Cc input (when visible) | `compose.cc-input` |
| Bcc input (when visible) | `compose.bcc-input` |

### tweaks
| Element | `data-testid` |
|---|---|
| FAB toggle | `tweaks.fab` |
| Panel container | `tweaks.panel` |
| Dark mode toggle | `tweaks.dark-toggle` |
| Accent select | `tweaks.accent-select` |
| Font radio (repeated) | `tweaks.font-radio` |
| Density radio (repeated) | `tweaks.density-radio` |
| Hints bar toggle | `tweaks.hints-toggle` |
| Notifications toggle | `tweaks.notifications-toggle` |
| Close button | `tweaks.close-btn` |

### about
| Element | `data-testid` |
|---|---|
| Dialog container | `about.dialog` |
| Close button | `about.close-btn` |

### headers-popover
| Element | `data-testid` |
|---|---|
| Popover container | `headers-popover.container` |
| Close button | `headers-popover.close-btn` |

### keyboard-help
| Element | `data-testid` |
|---|---|
| Dialog container | `keyboard-help.dialog` |

### hint-bar
| Element | `data-testid` |
|---|---|
| Overflow help button | `hint-bar.overflow-btn` |

### recipient-input
| Element | `data-testid` |
|---|---|
| Text input | (inherits from compose context: `compose.to-input` etc.) |
| Suggestion row (repeated) | `recipient-input.suggestion-row` |

## Risks / Trade-offs

- **Palette prop threading** → Wrapper components (AccountPicker, FolderPicker, CommandPalette) need a new `curtainTestId` prop passed through to Palette. Low risk — purely additive.
- **Test churn during migration** → Existing tests keep working; new testid-based selectors are added alongside. Gradual migration per page object.
- **Repeated testids in lists** → `mail-list.message-row` and `palette.row` appear multiple times. Tests must always use `.nth()`, `.first()`, or parent scoping — failing to do so will cause "strict mode" Playwright errors. Documented in the conventions spec.
