{ pkgs }:
{
  tauri-deps = with pkgs; [
    pkg-config
    dbus
    openssl
    glib
    gtk3
    dconf
    gsettings-desktop-schemas
    adwaita-icon-theme
    cairo
    gdk-pixbuf
    librsvg
    webkitgtk_4_1
    libsoup_3
    xdg-utils
    gobject-introspection
    glib-networking
    notmuch
  ];
  dev-deps = with pkgs; [
    deno
    cargo-tauri
    rustc
    cargo
    clippy
    rustfmt
    rust-analyzer
    # E2E (Playwright) toolchain. Node runs the Playwright test runner; the
    # browsers come from nixpkgs so they are never downloaded at runtime. Keep
    # @playwright/test (package.json) pinned to playwright-driver's version
    # (currently 1.59.1) to avoid the "browser/runner version mismatch" error.
    nodejs
    playwright-driver.browsers
  ];
}
