## ADDED Requirements

### Requirement: URL path reflects the current view

The application SHALL keep the browser URL in sync with the current navigation
view using the History API. The URL grammar SHALL be:

- `/` — account picker (no view selected)
- `/folder/:folderId` — message list for a folder
- `/folder/:folderId/message/:messageId` — a message open in the reader over its list
- `/search?q=<query>` — search results

`:folderId` and `:messageId` SHALL be the API identifiers. Navigations that a
user would expect to reverse with the Back button (opening a folder, opening a
message, running a search) SHALL create a new history entry (`pushState`).
Transient refinements (search-query keystrokes, auto-correction of an invalid
link) SHALL replace the current entry (`replaceState`) rather than add history.

#### Scenario: Opening a folder updates the URL
- **WHEN** the user selects a folder from the folder picker
- **THEN** the URL path becomes `/folder/<folderId>` and a new history entry is added

#### Scenario: Opening a message updates the URL
- **WHEN** the user opens a message from the list in folder `<folderId>`
- **THEN** the URL path becomes `/folder/<folderId>/message/<messageId>` and a new history entry is added

#### Scenario: Closing the reader returns to the folder URL
- **WHEN** a message is open and the user closes the reader (e.g. presses Esc)
- **THEN** the URL path returns to `/folder/<folderId>`

#### Scenario: Running a search updates the URL
- **WHEN** the user submits the search query `<query>`
- **THEN** the URL becomes `/search?q=<query>` and a new history entry is added

#### Scenario: Editing the search query does not stack history
- **WHEN** the user edits the search query in place after a search is active
- **THEN** the URL `q` parameter updates via `replaceState` without adding history entries

### Requirement: Deep links and reloads restore the matching view

On initial load, the application SHALL derive the navigation view from the URL
path and query and restore it, instead of always starting at the account picker.
The selected account SHALL be resolved from persisted/last-used state (the
account is not encoded in the path).

#### Scenario: Reloading a folder URL restores the list
- **WHEN** the browser loads `/folder/<folderId>` directly (deep link or reload)
- **THEN** the folder's message list is shown for the resolved account

#### Scenario: Reloading a message URL restores the reader
- **WHEN** the browser loads `/folder/<folderId>/message/<messageId>` directly
- **THEN** the folder list is shown with that message open in the reader

#### Scenario: Reloading a search URL restores results
- **WHEN** the browser loads `/search?q=<query>` directly
- **THEN** the search view is shown with `<query>` applied and results loaded

#### Scenario: Loading the root shows the account picker
- **WHEN** the browser loads `/`
- **THEN** the account picker is shown

### Requirement: Browser back and forward navigate between views

The application SHALL respond to browser history navigation (`popstate`) by
reconciling the view to the URL of the restored history entry.

#### Scenario: Back returns to the previous view
- **WHEN** the user has navigated folder → message and presses the browser Back button
- **THEN** the reader closes and the URL and view return to `/folder/<folderId>`

#### Scenario: Forward re-applies the next view
- **WHEN** the user presses Back and then the browser Forward button
- **THEN** the view advances again to match the forward history entry's URL

### Requirement: Invalid deep links degrade gracefully

The application SHALL fall back to the nearest valid view when a deep link
references a folder or message that cannot be resolved, and SHALL replace the
invalid history entry so Back does not return to it.

#### Scenario: Unknown message id falls back to the folder
- **WHEN** the browser loads `/folder/<folderId>/message/<missing>` and the message does not exist
- **THEN** the folder list is shown without the reader and the URL is replaced with `/folder/<folderId>`

#### Scenario: Unknown folder id falls back to the root
- **WHEN** the browser loads `/folder/<missing>` and the folder cannot be resolved
- **THEN** the account/folder picker is shown and the URL is replaced with `/`

### Requirement: Deep paths boot the single-page application

The static build SHALL be served such that any in-grammar path that does not map
to a static asset boots the application shell (SPA fallback), so the client
router can resolve the path. The application SHALL NOT render a client-side 404
for an in-grammar deep path.

#### Scenario: Server serves the shell for a deep path
- **WHEN** `mailbrus-server` receives `GET /folder/<folderId>/message/<messageId>` for a path with no matching file
- **THEN** it responds with the application shell (`index.html`) and the SPA renders the matching view

#### Scenario: Asset requests are not shadowed by routing
- **WHEN** the browser requests a static asset (e.g. `/assets/*`, `/sw.js`, `/manifest.webmanifest`)
- **THEN** the asset is served normally rather than the application shell

### Requirement: Offline navigation requests resolve to the cached shell

The service worker SHALL serve the cached application shell for navigation
requests (`request.mode === 'navigate'`) to any in-grammar path, so deep links
and reloads work offline.

#### Scenario: Offline deep-link reload serves the cached shell
- **WHEN** the device is offline and the browser navigates to `/folder/<folderId>`
- **THEN** the service worker responds with the cached application shell and the SPA restores the view
