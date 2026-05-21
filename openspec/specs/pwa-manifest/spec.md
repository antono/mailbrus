## Purpose

Define the Web App Manifest, install prompt handling, app shortcuts, and Share Target registration that make mailbrus installable as a PWA.

## Requirements

### Requirement: Web App Manifest is present and valid
The application SHALL serve a `manifest.webmanifest` file reachable at `/manifest.webmanifest`. It SHALL declare `name`, `short_name`, `icons` (at minimum 192×192 and 512×512 PNG), `display: standalone`, `start_url`, `theme_color`, and `background_color`.

#### Scenario: Manifest served
- **WHEN** the browser fetches `/manifest.webmanifest`
- **THEN** the response is `Content-Type: application/manifest+json` with all required fields present

#### Scenario: App installs as standalone
- **WHEN** the user accepts the install prompt (desktop or Android)
- **THEN** the app launches in a standalone window without browser chrome

### Requirement: Install prompt is surfaced to the user
The application SHALL listen for the `beforeinstallprompt` event and display a non-intrusive in-app install button when the event fires. The button SHALL be suppressed once the app is already installed (detected via `window.matchMedia('(display-mode: standalone)')`).

#### Scenario: Install button appears
- **WHEN** `beforeinstallprompt` fires and the app is not installed
- **THEN** an install affordance is visible in the UI

#### Scenario: Install button hidden when installed
- **WHEN** `display-mode` is `standalone`
- **THEN** no install affordance is shown

### Requirement: App shortcuts declared in manifest
The manifest SHALL declare at least two shortcuts: `Compose` (linking to `/compose`) and `Inbox` (linking to `/`).

#### Scenario: Shortcuts available
- **WHEN** the user long-presses or right-clicks the installed app icon
- **THEN** `Compose` and `Inbox` shortcuts are listed by the OS

### Requirement: Share Target registration
The manifest SHALL declare a `share_target` entry accepting `text`, `url`, and `files`, targeting `/compose` with the shared data passed as query parameters.

#### Scenario: File shared to app
- **WHEN** the user shares a file from another app to mailbrus
- **THEN** the compose view opens pre-populated with the shared file as an attachment

#### Scenario: URL shared to app
- **WHEN** the user shares a URL from a browser tab to mailbrus
- **THEN** the compose view opens with the URL in the message body
