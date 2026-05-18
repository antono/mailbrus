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
  ];
  dev-deps = with pkgs; [
    deno
    cargo-tauri
    rustc
    cargo
    clippy
    rustfmt
    rust-analyzer
  ];
}
