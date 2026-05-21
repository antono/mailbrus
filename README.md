# Mailbrus

Fast keyboard-first mail client with offline-capable PWA support.

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
