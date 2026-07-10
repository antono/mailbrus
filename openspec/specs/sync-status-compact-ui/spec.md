# sync-status-compact-ui Specification

## Purpose
TBD - created by archiving change sync-status-bar-redesign. Update Purpose after archive.
## Requirements
### Requirement: Compact idle state
The status bar SHALL display as a small circular dot (radius ~6px) when sync is not active and no errors exist.

#### Scenario: Show idle dot when sync is not running
- **WHEN** page loads and no sync is active
- **THEN** status bar displays a compact idle dot in the bottom-right corner

#### Scenario: Show idle dot after sync completes
- **WHEN** sync finishes successfully
- **THEN** the spinner morphs back to idle dot immediately, regardless of popup state

### Requirement: Idle dot morphs to sync button
Clicking the idle dot SHALL morph it into a "Sync now" button inline (same location, no popup).

#### Scenario: Click idle dot to reveal sync button
- **WHEN** user clicks the idle dot
- **THEN** dot animates (CSS transition) to become a "Sync now" button within 300ms

#### Scenario: Sync button is clickable
- **WHEN** "Sync now" button is visible
- **THEN** button is enabled and clickable (cursor: pointer)

### Requirement: Sync button morphs to spinner
Clicking the "Sync now" button SHALL initiate sync and morph the button into a spinner.

#### Scenario: Click sync button to start sync and show spinner
- **WHEN** user clicks "Sync now" button
- **THEN** sync request is sent AND button animates to spinner within 300ms

#### Scenario: Spinner displays rotation animation
- **WHEN** sync is active and spinner is visible
- **THEN** spinner rotates continuously (0.7s per rotation) indicating activity

### Requirement: Spinner morphs to popup on click
Clicking the spinner SHALL open a detailed popup modal (below the spinner).

#### Scenario: Click spinner to open popup
- **WHEN** user clicks the active spinner
- **THEN** popup appears positioned below spinner (fixed position, no click propagation)

#### Scenario: Popup contains close button
- **WHEN** popup is open
- **THEN** popup header has an × button to close it

### Requirement: Return to idle after sync completion
After sync completes, the spinner SHALL morph back to idle dot while popup remains open (if it was open).

#### Scenario: Spinner returns to idle dot after sync success
- **WHEN** sync finishes (backend signals completion)
- **THEN** spinner animates back to idle dot within 300ms

#### Scenario: Idle dot returned to initial position
- **WHEN** sync completes and morphing completes
- **THEN** dot is in same location as initial idle state (no repositioning)

### Requirement: Error state styling
When sync encounters an error, the dot SHALL display in red with error styling.

#### Scenario: Error dot visible during failed sync
- **WHEN** sync fails or backend reports an error
- **THEN** idle dot is colored red (destructive color) and styled as error state

#### Scenario: Error state persists until next successful sync
- **WHEN** error occurs and user views status later
- **THEN** error dot remains visible until next sync starts and succeeds

### Requirement: Morphing animations are smooth
All state transitions (dot ↔ button ↔ spinner) SHALL use CSS transitions for smooth morphing.

#### Scenario: Smooth transition from dot to button
- **WHEN** idle dot is clicked
- **THEN** width, opacity, and content smoothly transition over 300ms (no jarring changes)

#### Scenario: Smooth transition from button to spinner
- **WHEN** sync button is clicked
- **THEN** content morphs to spinner with smooth rotation animation start

### Requirement: Minimal footprint at rest
The idle dot SHALL occupy minimal screen space and not interfere with other UI elements.

#### Scenario: Idle dot fits in bottom-right corner
- **WHEN** page renders with idle dot
- **THEN** dot is positioned fixed at bottom-right with 12px margin, total ~20px footprint

#### Scenario: Morphed button does not overflow
- **WHEN** "Sync now" button is displayed
- **THEN** button width auto-adjusts but stays within 100px and does not overlap other UI

### Requirement: Popup positioning below spinner
The popup modal SHALL position itself directly below the spinner/button without overlapping.

#### Scenario: Popup appears below without repositioning on small screens
- **WHEN** user clicks spinner on a mobile viewport (320px width)
- **THEN** popup positions below spinner and adjusts width to fit (max 80vw)

#### Scenario: Popup z-index ensures visibility
- **WHEN** popup is open
- **THEN** popup has sufficient z-index (≥50) to appear above other UI elements

