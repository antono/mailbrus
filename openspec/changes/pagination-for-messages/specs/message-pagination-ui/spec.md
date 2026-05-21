## ADDED Requirements

### Requirement: Pagination component displays position and navigation controls
A `Pagination.svelte` component SHALL accept props `page: number`, `perPage: number`, `count: number` and render a previous-page button, a next-page button, and a position indicator showing the current range and total (e.g. "26–50 of 312"). It SHALL dispatch a `pageChange` event with the new page number when a button is clicked.

#### Scenario: Middle page
- **WHEN** `page=2`, `perPage=25`, `count=100` are passed
- **THEN** the component shows "26–50 of 100", the previous button is enabled, and the next button is enabled

#### Scenario: First page
- **WHEN** `page=1`, `perPage=25`, `count=60` are passed
- **THEN** the previous button is disabled and the next button is enabled

#### Scenario: Last page
- **WHEN** `page=3`, `perPage=25`, `count=60` are passed
- **THEN** the next button is disabled and the previous button is enabled

#### Scenario: Single page
- **WHEN** `count` is less than or equal to `perPage`
- **THEN** the pagination component is not rendered (hidden or absent)

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
