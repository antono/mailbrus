## MODIFIED Requirements

### Requirement: Reader navigation keys
Inside the reader, `j`/`↓` and `k`/`↑` SHALL move to the next/previous message across the **entire folder**, not just the loaded page. When the open message is the last loaded message of the current page and a later page exists, `j`/`↓` SHALL load the next page and open its first message; when the open message is the first message of the current page and an earlier page exists, `k`/`↑` SHALL load the previous page and open its last message. At the absolute last (respectively first) message of the folder, `j`/`↓` (respectively `k`/`↑`) SHALL do nothing. `Escape` SHALL close the reader and return to the list with the current message selected and scrolled into view; because reader navigation may have crossed pages, the list MAY show a different page than the one the reader was opened from. `g g` (g pressed twice within 1.2 s) SHALL scroll the reader message body to the top. `G` SHALL scroll the reader message body to the bottom. `J` SHALL scroll the reader body down by 20 lines (400 px) and `K` SHALL scroll it up by 20 lines; these keys SHALL stop propagation so they do not trigger next/previous message navigation.

#### Scenario: Next message within the current page
- **WHEN** the reader is open on a message that is not the last loaded on the page and the user presses `j` or `↓`
- **THEN** the reader advances to the next message on the same page; the list selected index updates accordingly

#### Scenario: Previous message within the current page
- **WHEN** the reader is open on a message that is not the first on the page and the user presses `k` or `↑`
- **THEN** the reader moves to the previous message on the same page; the list selected index updates accordingly

#### Scenario: Next message crosses to the following page
- **WHEN** the reader is open on the last loaded message of page N, a page N+1 exists, and the user presses `j` or `↓`
- **THEN** the list loads page N+1 and the reader opens the first message of page N+1; the current page becomes N+1

#### Scenario: Previous message crosses to the preceding page
- **WHEN** the reader is open on the first message of page N (N > 1) and the user presses `k` or `↑`
- **THEN** the list loads page N−1 and the reader opens the last message of page N−1; the current page becomes N−1

#### Scenario: Next at the last message of the folder is a no-op
- **WHEN** the reader is open on the last message of the last page and the user presses `j` or `↓`
- **THEN** nothing happens; the same message stays open

#### Scenario: Escape closes reader on the current page
- **WHEN** the reader is open and the user presses `Escape`
- **THEN** the reader closes and the list is visible, showing the page that contains the current message, with that message selected and scrolled into view

#### Scenario: gg scrolls reader body to top
- **WHEN** the reader is open and the user presses `g` then `g` within 1.2 s
- **THEN** the reader message body scroll container scrolls to the top

#### Scenario: G scrolls reader body to bottom
- **WHEN** the reader is open and the user presses `G`
- **THEN** the reader message body scroll container scrolls to the bottom

#### Scenario: J scrolls reader body down
- **WHEN** the reader is open and the user presses `J`
- **THEN** the reader message body scroll container scrolls down 400 px (smooth); next-message navigation does not trigger

#### Scenario: K scrolls reader body up
- **WHEN** the reader is open and the user presses `K`
- **THEN** the reader message body scroll container scrolls up 400 px (smooth); previous-message navigation does not trigger

## ADDED Requirements

### Requirement: Reader quit-to-list key
Inside the reader, `q` SHALL close the reader and return to the message list with the currently-open message selected and scrolled into view, on whatever page that message currently lives (which may differ from the page the reader was opened from). `q` SHALL be documented in the keyboard help under the reader scope.

#### Scenario: q returns to the list focused on the current message
- **WHEN** the reader is open and the user presses `q`
- **THEN** the reader closes, the list is shown on the page containing the current message, and that message's row is selected and scrolled into view

#### Scenario: q after cross-page navigation lands on the new page
- **WHEN** the user has pressed `j` enough times to cross into a later page and then presses `q`
- **THEN** the list is shown on that later page with the current message selected and scrolled into view, not on the page the reader was opened from

#### Scenario: q is listed in keyboard help
- **WHEN** the keyboard help overlay is opened while the reader is the active scope
- **THEN** `q` appears with a "quit to list" description
