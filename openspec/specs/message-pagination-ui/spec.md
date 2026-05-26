## Purpose

Define the UI components and page-level behaviour for paginating through message lists and search results in the mailbrus frontend.
## Requirements
### Requirement: Pagination component displays position and navigation controls
A `Pagination.svelte` component SHALL accept props `page: number`, `perPage: number`, `count: number` and render a previous-page button, a next-page button, and a position indicator. The indicator SHALL display the current page number and last page number in the format `{page} / {lastPage}` (e.g. "2 / 4"). It SHALL dispatch a `pageChange` event with the new page number when a button is clicked. When the `page` prop changes, the page-number portion of the indicator SHALL briefly highlight with a fade-out animation (visible in both light and dark themes).

#### Scenario: Middle page
- **WHEN** `page=2`, `perPage=25`, `count=100` are passed
- **THEN** the component shows "2 / 4", the previous button is enabled, and the next button is enabled

#### Scenario: First page
- **WHEN** `page=1`, `perPage=25`, `count=60` are passed
- **THEN** the previous button is disabled, the next button is enabled, and the indicator shows "1 / 3"

#### Scenario: Last page
- **WHEN** `page=3`, `perPage=25`, `count=60` are passed
- **THEN** the next button is disabled, the previous button is enabled, and the indicator shows "3 / 3"

#### Scenario: Single page
- **WHEN** `count` is less than or equal to `perPage`
- **THEN** the pagination component is not rendered (hidden or absent)

#### Scenario: Page counter highlights on navigation
- **WHEN** the user navigates to a different page (previous or next)
- **THEN** the page-number span briefly flashes a highlight color and fades back to normal within ~400 ms

#### Scenario: Highlight works in dark mode
- **WHEN** the user navigates a page and the app is in dark mode
- **THEN** the highlight animation is visible against the dark background

### Requirement: Message list uses Pagination component
The message list view in `+page.svelte` SHALL render `Pagination.svelte` below the message list when more than one page of results exists. On `pageChange`, it SHALL call `fetchMessages` with the new page number and update the displayed messages.

#### Scenario: Navigate to next page
- **WHEN** user clicks the next-page button on page 1 of a folder with 60 messages
- **THEN** messages 26–50 are fetched and displayed, and the indicator shows "26–50 of 60"

#### Scenario: Page resets on folder switch
- **WHEN** user selects a different folder
- **THEN** page resets to 1 and the first page of the new folder's messages is loaded

### Requirement: Search results use Pagination component
The search results view in `+page.svelte` SHALL render `Pagination.svelte` below search results when more than one page exists. On `pageChange`, it SHALL call `searchMessages` with the current query and new page number.

#### Scenario: Navigate to next page of search results
- **WHEN** user clicks the next-page button on search results with 80 matches
- **THEN** results 26–50 are fetched and displayed

#### Scenario: Page resets on new search query
- **WHEN** user submits a new search query while on page 2
- **THEN** page resets to 1 before calling `searchMessages`

### Requirement: Breadcrumb pagination indicator shows page X / Y
The page indicator rendered inside the `MailList.svelte` breadcrumb bar (when more than one page exists) SHALL display `{page} / {lastPage}` in place of the previous `page {page}: {start}–{end} of {count}` format. The breadcrumb indicator SHALL also animate the page counter on navigation using the same CSS keyframe as `Pagination.svelte`.

#### Scenario: Breadcrumb shows X / Y format
- **WHEN** a multi-page folder is loaded and `page=2`, `count=60`, `perPage=25`
- **THEN** the breadcrumb displays "2 / 3" (not "page 2: 26–50 of 60")

#### Scenario: Breadcrumb counter animates on page change
- **WHEN** the user navigates to the next or previous page via the breadcrumb arrows
- **THEN** the page number flashes and fades within ~400 ms

