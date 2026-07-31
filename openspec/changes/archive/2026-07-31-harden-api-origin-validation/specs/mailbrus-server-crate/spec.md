## MODIFIED Requirements

### Requirement: Startup warning when binding non-loopback without auth
The server SHALL print a warning to stderr when `--bind` resolves to a non-loopback address and `--auth` is not set, and SHALL enforce the token on `/api/*` requests when `--auth` is set (see the `api-origin-validation` capability) rather than leaving the flag a no-op that only affects the startup warning.

#### Scenario: Public bind without auth
- **WHEN** user runs `mailbrus-server --bind 0.0.0.0:1371` without `--auth`
- **THEN** server starts but logs `WARNING: server is publicly accessible without authentication`

#### Scenario: Auth flag is enforced, not just warned
- **WHEN** user runs `mailbrus-server --auth s3cret` and an `/api/*` request omits a matching `Authorization: Bearer` header
- **THEN** the server responds `401 Unauthorized` (the flag gates requests, not only the warning)
