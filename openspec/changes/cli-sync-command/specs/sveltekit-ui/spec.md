## ADDED Requirements

### Requirement: Cold deep-link to a folder loads its messages
The SPA SHALL load a folder's messages when the user navigates directly to a
folder URL (e.g. `/folder/INBOX`) on a fresh load before any account is
selected. It SHALL resolve the account, fetch its folders, and load the folder
without requiring a manual reload. Auto-selecting the account for a folder
deep-link SHALL NOT open the folder picker or clear the current folder.

#### Scenario: First visit to a folder URL shows the message list
- **WHEN** the user opens `/folder/INBOX` cold (no account selected yet) while accounts are still loading
- **THEN** once accounts load the app selects the account, loads INBOX, and shows the message list — without a manual reload
