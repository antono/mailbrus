---
name: mailbrus-e2e-author
description: Authoring Playwright end-to-end tests for the mailbrus repo. Use this skill whenever the user asks to add, modify, port, or write an E2E test, spec, or `.spec.ts` file under `e2e/`, or when an OpenSpec change in this repo lists "e2e test validation" tasks. Encodes the per-test isolated server harness, the page-object + manifest contract, the testid selector convention, and the mandatory `// openspec/...` reference comment that every test in this repo carries.
---

# Authoring mailbrus E2E tests

Mailbrus E2E specs drive the real SvelteKit SPA against a real `mailbrus-server`
backed by a real notmuch index — one clone + server per test, no mocks. The
harness is already built; your job is to write idiomatic specs that use it
correctly and that stay in lockstep with the manifest and the OpenSpec
behaviour they verify.

Architecture, lifecycle, fixture manifest, the Node-vs-Deno split, and the
known UI gaps are documented in [`docs/e2e-testing.md`](../../../docs/e2e-testing.md).
Read it once if you haven't — the rest of this skill assumes that context.

## Hard rules

These are the rules every spec in this repo follows. Match them or the suite
loses the properties it was designed for.

1. **Every test carries an OpenSpec reference comment.** Immediately above each
   `test(...)` (or `test.fixme(...)`, `test.describe.skip(...)`), write a single
   line comment of the form:
   ```ts
   // openspec/specs/<capability>/spec.md: <one-line what this asserts>
   ```
   or, when the behaviour is still in an unarchived change proposal:
   ```ts
   // openspec/changes/<change-name>/specs/<capability>/spec.md: <one-line>
   ```
   This is non-negotiable — it pins the test to the behaviour spec it verifies.
   When several tests in a row assert the same requirement, repeat the same
   reference; do not factor it out into a `describe` and drop it on individual
   tests. Find the right path by checking `openspec/specs/` and
   `openspec/changes/`; pick the most specific spec file that documents the
   requirement the test asserts. (See `references/openspec-mapping.md` for the
   common areas and how existing specs use them.)

2. **Import `test`/`expect` from the harness, not Playwright.** Every spec that
   needs a running server starts with:
   ```ts
   import { test, expect } from '../harness/fixtures.ts';
   ```
   This wires the per-test `app` fixture (clone → index → spawn server →
   teardown) and rewrites Playwright's `baseURL`. The only spec that imports
   directly from `@playwright/test` is `consistency.spec.ts`, which runs without
   a server because it only inspects the on-disk corpus.

3. **Drive the UI through the page objects in `e2e/pages/`, never with raw
   selectors.** `AccountsPage`, `MailboxPage`, `MessagePage`. If the action you
   need is not on a page object, extend the page object — do not embed brittle
   selectors in the spec. The only DOM selectors that belong in spec files are
   `getByTestId(...)` calls for elements without a corresponding page-object
   method, and even then prefer adding the method.

4. **All expected values come from the manifest.** Subjects, addresses, folder
   names, message counts, attachment lists — pull them from
   `e2e/fixtures/manifest.ts` via `manifest`, `folderOf(...)`,
   `messagesNewestFirst(...)`, `isUnread(...)`, `PER_PAGE`, etc. Never hard-code
   `'alice@example.com'`-style literals inside an assertion; bind to the entry
   once at the top of the file and reference its fields. A corpus change must
   propagate to assertions automatically.

5. **Selectors are `data-testid` attributes shaped `area.name`** —
   e.g. `accounts.curtain`, `mail-list.message-row`, `reader.container`,
   `settings.font-seg`, `commands.curtain`. Reach for `getByTestId` first.
   `getByRole`/`getByText` are fine for content inside a testid'd container or
   for shadcn-style radio groups (`getByRole('radio', { name: 'sans' })`).

6. **Use `{ app, request }` for API-level tests, `{ page }` for UI tests.**
   API tests call `request.get(\`${app.baseURL}/api/...\`)` and assert on JSON
   responses — see `attachment-actions.spec.ts` for the canonical examples.
   They run faster than UI tests and are the right tool when the assertion is
   about server behaviour, even if the change also affects the SPA.

7. **Asynchrony: prefer `expect.poll` and locator auto-retry over `waitForTimeout`.**
   Body content loads asynchronously, the message list re-renders on page
   change, and IDB writes commit on the next microtask. The only place
   `waitForTimeout` is acceptable in this suite is bridging IndexedDB writes
   across an explicit `page.reload()` (see `settings.spec.ts` ->
   `reloadToMailbox`).

8. **Mark known UI gaps with `test.fixme`, not skip or delete.** When the
   backend supports something the SPA doesn't yet, keep the spec in the file
   under `test.fixme(...)` with a comment explaining the gap. It shows as
   skipped (not failed) and enables the moment the SPA catches up. See
   `signatures.spec.ts` for the canonical example.

## File skeleton

This is the shape every UI-driving spec follows. Copy it, fill it in, delete
anything you don't use.

```ts
/** <one-line description of what this file covers> */
import { test, expect } from '../harness/fixtures.ts';
import { AccountsPage } from '../pages/AccountsPage.ts';
import { MailboxPage } from '../pages/MailboxPage.ts';
import { MessagePage } from '../pages/MessagePage.ts';
import { folderOf, manifest } from '../fixtures/manifest.ts';

const alice = manifest.find((a) => a.address === 'alice@example.com')!;
const inbox = folderOf(alice, 'Inbox');
const targetMsg = inbox.messages.find((m) => m.slug === 'alice-inbox-XX-...')!;

async function openInbox(page: import('@playwright/test').Page): Promise<MailboxPage> {
  const accounts = new AccountsPage(page);
  await accounts.open();
  await accounts.select(alice.address);
  const mailbox = new MailboxPage(page);
  await mailbox.openFolder('Inbox');
  return mailbox;
}

// openspec/specs/<capability>/spec.md: <what this asserts>
test('<scenario described in plain English>', async ({ page }) => {
  const mailbox = await openInbox(page);
  await mailbox.openMessage(targetMsg.subject);

  const reader = new MessagePage(page);
  await expect(reader.bodyLocator()).not.toBeEmpty(); // wait for async body load
  await expect(reader.subjectLocator()).toContainText(targetMsg.subject);
});
```

If the same setup repeats across two or more tests in the file, lift it into a
local `async function` (e.g. `openInbox`, `openSettings`) — that mirrors how
the existing specs are organised and keeps each test body focused on the
behaviour under test.

## API-only test skeleton

```ts
// openspec/specs/mailbrus-server-crate/spec.md: <api behaviour>
test('GET /api/messages/:id returns expected attachments', async ({ app, request }) => {
  const res = await request.get(
    `${app.baseURL}/api/messages/${encodeURIComponent(targetMsg.messageId)}`
  );
  expect(res.ok()).toBe(true);
  const data = (await res.json()) as { attachments: { name: string; mime: string }[] };
  expect(data.attachments.map((a) => a.name)).toEqual(
    targetMsg.attachments.map((a) => a.filename)
  );
});
```

Always `encodeURIComponent` the message ID (Message-IDs contain `@` and may
contain other special characters).

## Choosing a fixture message

The corpus has 39 messages — pick the one whose state already encodes what
you want to assert. Use the slug to identify it; the slug is the stable key.

| Want to test… | Use slug | Why |
| --- | --- | --- |
| Read, signed | `alice-inbox-01-read-signed` | `cur/`, flags `S`, signed body |
| Unread, plain | `alice-inbox-02-unread-plain` | in `new/`, no flags |
| Flagged + PDF attachment | `alice-inbox-03-flagged-pdf` | flags `FS`, one attachment |
| Replied + multiple attachments | `alice-inbox-04-replied-multi` | flags `RS`, mixed MIMEs |
| Broken signature | `alice-inbox-06-broken-sig` | for the `test.fixme` slot |
| HTML-only message | `alice-inbox-07-html-only` | no text/plain part |
| Multipart text+html | `alice-inbox-08-multipart-alt` | both bodies |
| Historical date (2009) | `alice-inbox-05b-historical-date` | proves date formatting |
| Pagination | folder `Archive` | 27 messages > PER_PAGE (25) |

If no existing message has the property you need, add one to `manifest.ts`
**before** the test (see "Extending the corpus" below). Do not write a test
that depends on a message you have not added.

## Manifest helpers cheat sheet

All exported from `e2e/fixtures/manifest.ts`:

- `manifest` — full corpus tree
- `folderOf(account, name)` — get a folder by `FolderName`
- `messagesNewestFirst(folder)` — match the server's default sort
- `isUnread(m)`, `isFlagged(m)`, `isReplied(m)`, `isTrashed(m)` — predicates
  that know maildir flag semantics; use them inside assertions instead of
  re-deriving from `box`/`flags`
- `hasHtmlBody(m)`, `hasRemoteImages(m)` — body-shape predicates
- `filenameOf(m)`, `relPathOf(account, folder, m)` — for filesystem-level
  assertions (mostly `consistency.spec.ts`)
- `PER_PAGE` — the SPA's page size (25); use this, never the literal
- `FOLDER_NAMES`, `SIGNATURE_BLOCK`, `SignatureKind` — typed constants

## Extending the corpus

When a new spec needs a message, attachment, or list-header shape that doesn't
exist yet:

1. Add a `ManifestMessage` to the right `ManifestAccount.folders[i].messages`
   in `e2e/fixtures/manifest.ts`. Slug **and** Message-ID must be unique
   (notmuch dedupes on Message-ID — a collision silently drops one of them).
   Encode state via `box` (`new` ⇒ unread) and `flags`, not via a post-index
   step.
2. Run `deno task e2e:generate` to materialise the `.eml` files.
3. `consistency.spec.ts` will fail loudly if the manifest and disk diverge —
   that's the contract working. Fix the manifest, regenerate, until green.
4. Never hand-edit a generated `.eml` file; the next regen will clobber it.

## Common pitfalls observed in this repo

- **Forgetting the OpenSpec comment.** Reviewers will ask for it; CI doesn't
  enforce it but every existing spec has one. Add it from the first draft.
- **Asserting before the body has loaded.** The reader opens immediately but
  the body is fetched on a separate tick. Gate body-content assertions on
  `await expect(reader.bodyLocator()).not.toBeEmpty()` first.
- **Using `Escape` to close a modal whose focus is on a switch/radio.** The
  switch eats the Escape. Use `settings.close-btn` (or the equivalent close
  affordance) when you've just clicked into a focusable form control. See
  `settings.spec.ts` -> the key-hints persistence tests.
- **Hard-coding subjects or addresses.** If you wrote `'Quarterly planning
  notes'` in a `.toContainText(...)`, replace it with `targetMsg.subject` and
  bind `targetMsg` at the top of the file.
- **`page.waitForTimeout(...)` for async UI.** Replace with `expect.poll(...)`
  on the value you actually care about, or rely on locator auto-retry. The one
  legitimate use is the ~400ms guard before `page.reload()` when an IDB write
  must commit first.
- **Building selectors from scratch when a page object exists.** Add a method
  to `AccountsPage` / `MailboxPage` / `MessagePage` instead — that's where the
  next test will look for it too.

## After writing the spec

- Run it: `deno task test:e2e <pattern>` (e.g. `deno task test:e2e mynewfeature`).
  The Nix devShell is required for `notmuch` + browsers; see `docs/e2e-testing.md`
  §7 if the suite refuses to start.
- On failure, `deno task e2e:debug` opens the Playwright trace viewer on the
  most recent retained trace.
- If you added to the manifest, also rerun the full suite once to make sure no
  pagination/count assertion elsewhere broke (e.g. the `consistency.spec.ts`
  totals, `pagination.spec.ts` for `Archive`).

## When to read the reference

`references/openspec-mapping.md` — the canonical list of capability slugs the
OpenSpec comment may point to, with which kind of behaviour each one covers.
Open it when you're unsure which `openspec/specs/<...>/spec.md` to cite.
