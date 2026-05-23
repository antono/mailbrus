## ADDED Requirements

### Requirement: Server can open the default browser on startup

`mailbrus-server` SHALL accept a `--browser` boolean CLI flag that defaults to disabled. When the flag is enabled, after the HTTP listener has successfully bound, the server SHALL open the operating system's default web browser at the server's resolved base URL. The URL SHALL be constructed from the listener's actual bound socket address (not the raw `--bind` argument), so that an ephemeral port requested via `--bind <ADDR>:0` resolves to the concrete port the OS assigned. When the bound host is an unspecified address (`0.0.0.0` or `::`), the browser URL SHALL use loopback (`127.0.0.1` or `[::1]` respectively), because a browser cannot connect to an unspecified address. The browser SHALL be launched using a cross-platform mechanism that works on Linux, macOS, and Windows. A failure to launch the browser SHALL NOT terminate the server.

#### Scenario: Flag disabled by default

- **WHEN** user runs `mailbrus-server` with no `--browser` flag
- **THEN** the server starts and listens normally and makes no attempt to open a browser

#### Scenario: Browser opens at bound URL

- **WHEN** user runs `mailbrus-server --browser` with the default bind `127.0.0.1:1371`
- **THEN** after the listener binds, the server opens the default browser at `http://127.0.0.1:1371`

#### Scenario: Ephemeral port resolves to the real assigned port

- **WHEN** user runs `mailbrus-server --browser --bind 127.0.0.1:0`
- **THEN** the OS assigns a free port and the server opens the browser at `http://127.0.0.1:<assigned-port>` using the listener's actual local address, never the literal `:0`

#### Scenario: Unspecified bind host maps to loopback in the browser URL

- **WHEN** user runs `mailbrus-server --browser --bind 0.0.0.0:9000`
- **THEN** the server opens the browser at `http://127.0.0.1:9000`, substituting loopback for the unspecified bind host (and likewise `[::]` maps to `[::1]`)

#### Scenario: Browser launch failure is non-fatal

- **WHEN** `--browser` is set but no browser can be launched (e.g. a headless environment with no default handler)
- **THEN** the server logs a warning and continues accepting and serving HTTP requests normally

#### Scenario: Browser launch does not block serving

- **WHEN** `--browser` is set and the server launches the browser
- **THEN** the server begins accepting connections without waiting for the browser process to exit
