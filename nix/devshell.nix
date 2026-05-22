{ pkgs, tauri-deps, dev-deps }:
let
  gtk3 = pkgs.gtk3;
  gschema = pkgs.gsettings-desktop-schemas;
in
pkgs.mkShell {
  buildInputs = tauri-deps ++ dev-deps ++ [ gtk3 pkgs.gtk4 gschema pkgs.adwaita-icon-theme pkgs.glib ];

  shellHook = ''
    echo "mailbrus dev environment"
    echo "  rustc $(rustc --version)"
    echo "  deno  $(deno --version | head -1)"
    cargo tauri --version 2>/dev/null || echo "  cargo-tauri: available"

    # GTK file chooser requires gsettings-schemas path (per Tauri docs)
    export XDG_DATA_DIRS="${gschema}/share/gsettings-schemas/${gschema.name}:${gtk3}/share/gsettings-schemas/${gtk3.name}:$XDG_DATA_DIRS"
  '';

  env = {
    PKG_CONFIG_PATH = "${pkgs.openssl.dev}/lib/pkgconfig";
    WEBKIT_DISABLE_COMPOSITING_MODE = "1";
    WEBKIT_DISABLE_DMABUF_RENDERER = "1";
    GDK_BACKEND = "x11";

    # Playwright E2E: use the Nix-provided browsers, never download at runtime.
    PLAYWRIGHT_BROWSERS_PATH = "${pkgs.playwright-driver.browsers}";
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";
    PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";
  };
}
