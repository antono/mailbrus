# Mailbrus

Fast keyboard-first mail client with offline-capable PWA support.

## Running the Server

`mailbrus-server` serves the built SvelteKit frontend and the JSON API:

```sh
mailbrus-server [--bind ADDR:PORT] [--frontend-dist DIR] [--auth TOKEN] [--browser]
```

- `--bind` (default `127.0.0.1:1371`) — address to listen on. Use `127.0.0.1:0` to let the OS pick a free port.
- `--frontend-dist` (default `./build`) — directory of built frontend assets.
- `--auth TOKEN` — optional auth token; a warning is printed if you bind to a non-loopback address without it.
- `--browser` — open the default web browser at the server URL after startup. The URL is resolved from the actual bound address, so it works with ephemeral ports (`--bind 127.0.0.1:0`) and maps unspecified hosts (`0.0.0.0` / `::`) to loopback.

## Debug Logging

To enable verbose PWA debug logging in any build (including production):

```js
localStorage.setItem('mailbrus:debug', 'true')
```

Then refresh the page. Debug logs appear in the browser console under namespaces like `[SW]`, `[cache:write]`, `[outbox]`, `[mutations]`, `[frecency]`, `[settings]`, `[push]`, and `[badge]`.

To disable:

```js
localStorage.removeItem('mailbrus:debug')
```

Then refresh.

**Note:** Service Worker logs also require re-registering the SW with the `?debug=1` query param, which happens automatically on page load when the flag is set.

## Server Debug Logging

Enable server-side PWA endpoint logging:

```sh
RUST_LOG=mailbrus_server=debug ./mailbrus-server
```

This enables `[pwa]`-prefixed `DEBUG` logs for `/api/send`, `/api/messages/*`, and `/api/push/*`.
