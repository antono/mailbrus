{ pkgs, tauri-deps, io-email, io-maildir, system }:
let
  mailbrus = pkgs.rustPlatform.buildRustPackage {
    pname = "mailbrus";
    version = "0.1.0";
    src = ../.;
    cargoLock = {
      lockFile = ../Cargo.lock;
      outputHashes = {
        # pimalaya/core git packages (all same rev b3a9640)
        "email-lib-0.27.0"   = "sha256-+zp0WPMZ3Y9PgWWzNAAuUNKFUF7c2VrDijI82pA8GJk=";
        "http-lib-0.1.0"     = "sha256-+zp0WPMZ3Y9PgWWzNAAuUNKFUF7c2VrDijI82pA8GJk=";
        "keyring-lib-1.0.3"  = "sha256-+zp0WPMZ3Y9PgWWzNAAuUNKFUF7c2VrDijI82pA8GJk=";
        "mml-lib-1.1.2"      = "sha256-+zp0WPMZ3Y9PgWWzNAAuUNKFUF7c2VrDijI82pA8GJk=";
        "oauth-lib-2.0.0"    = "sha256-+zp0WPMZ3Y9PgWWzNAAuUNKFUF7c2VrDijI82pA8GJk=";
        "pgp-lib-1.0.0"      = "sha256-+zp0WPMZ3Y9PgWWzNAAuUNKFUF7c2VrDijI82pA8GJk=";
        "process-lib-1.0.0"  = "sha256-+zp0WPMZ3Y9PgWWzNAAuUNKFUF7c2VrDijI82pA8GJk=";
        "secret-lib-1.0.1"   = "sha256-+zp0WPMZ3Y9PgWWzNAAuUNKFUF7c2VrDijI82pA8GJk=";
        # pimalaya/imap-client git package (rev 5600187)
        "imap-client-0.3.1"  = "sha256-TgmhgPVwv0MNSniejb7uCwbbjy2y8/e1mEJmOqzlMU0=";
        # pimalaya/io-email and io-maildir
        "io-email-0.0.1"     = "sha256-cXvItn/GvHlpCEhx9n53/GiTADakBk70/YTcowXB3m8=";
        "io-maildir-0.0.1"   = "sha256-mDuzb+/KkitAum3+KzaxJ7J6SH/CK38er0UjLtZqRGc=";
      };
    };
    buildAndTestFocus = "mailbrus-cli";
    nativeBuildInputs = [ pkgs.pkg-config ];
    buildInputs = tauri-deps;
    doCheck = false;
  };

  mailbrus-frontend = pkgs.stdenv.mkDerivation {
    pname = "mailbrus-frontend";
    version = "0.1.0";
    src = ../.;
    nativeBuildInputs = [ pkgs.deno ];
    buildPhase = ''
      export DENO_DIR=$(mktemp -d)
      # TODO: vendor deno deps for fully hermetic build
      # For now relies on deno.lock for reproducibility
      deno task build
    '';
    installPhase = ''
      mkdir -p $out
      cp -r build/* $out
    '';
  };

  mailbrus-desktop = pkgs.rustPlatform.buildRustPackage {
    pname = "mailbrus-desktop";
    version = "0.1.0";
    src = ../.;
    cargoLock = {
      lockFile = ../Cargo.lock;
      outputHashes = {
        # pimalaya/core git packages (all same rev b3a9640)
        "email-lib-0.27.0"   = "sha256-+zp0WPMZ3Y9PgWWzNAAuUNKFUF7c2VrDijI82pA8GJk=";
        "http-lib-0.1.0"     = "sha256-+zp0WPMZ3Y9PgWWzNAAuUNKFUF7c2VrDijI82pA8GJk=";
        "keyring-lib-1.0.3"  = "sha256-+zp0WPMZ3Y9PgWWzNAAuUNKFUF7c2VrDijI82pA8GJk=";
        "mml-lib-1.1.2"      = "sha256-+zp0WPMZ3Y9PgWWzNAAuUNKFUF7c2VrDijI82pA8GJk=";
        "oauth-lib-2.0.0"    = "sha256-+zp0WPMZ3Y9PgWWzNAAuUNKFUF7c2VrDijI82pA8GJk=";
        "pgp-lib-1.0.0"      = "sha256-+zp0WPMZ3Y9PgWWzNAAuUNKFUF7c2VrDijI82pA8GJk=";
        "process-lib-1.0.0"  = "sha256-+zp0WPMZ3Y9PgWWzNAAuUNKFUF7c2VrDijI82pA8GJk=";
        "secret-lib-1.0.1"   = "sha256-+zp0WPMZ3Y9PgWWzNAAuUNKFUF7c2VrDijI82pA8GJk=";
        # pimalaya/imap-client git package (rev 5600187)
        "imap-client-0.3.1"  = "sha256-TgmhgPVwv0MNSniejb7uCwbbjy2y8/e1mEJmOqzlMU0=";
        # pimalaya/io-email and io-maildir
        "io-email-0.0.1"     = "sha256-cXvItn/GvHlpCEhx9n53/GiTADakBk70/YTcowXB3m8=";
        "io-maildir-0.0.1"   = "sha256-mDuzb+/KkitAum3+KzaxJ7J6SH/CK38er0UjLtZqRGc=";
      };
    };
    buildAndTestFocus = "mailbrus-desktop";
    nativeBuildInputs = [
      pkgs.pkg-config
      pkgs.wrapGAppsHook3
      pkgs.gobject-introspection
      pkgs.jq
    ];
    buildInputs = tauri-deps ++ [ pkgs.gtk3 pkgs.gsettings-desktop-schemas pkgs.adwaita-icon-theme ];

    postPatch = ''
      jq '.build.devUrl = null | .build.frontendDist = "${mailbrus-frontend}"' src-tauri/tauri.conf.json > src-tauri/tauri.conf.json.tmp
      mv src-tauri/tauri.conf.json.tmp src-tauri/tauri.conf.json
    '';

    TAURI_ENV_DEBUG = "false";

    postInstall = ''
      mkdir -p $out/share/applications
      cp src-tauri/mailbrus-desktop.desktop $out/share/applications/

      mkdir -p $out/share/icons/hicolor/scalable/apps
      cp src-tauri/icons/logo.svg $out/share/icons/hicolor/scalable/apps/mailbrus-desktop.svg

      for size in 32 64 128; do
        mkdir -p $out/share/icons/hicolor/''${size}x''${size}/apps
        cp src-tauri/icons/''${size}x''${size}.png $out/share/icons/hicolor/''${size}x''${size}/apps/mailbrus-desktop.png
      done
    '';
  };
  mailbrus-server = pkgs.rustPlatform.buildRustPackage {
    pname = "mailbrus-server";
    version = "0.1.0";
    src = ../.;
    cargoLock = {
      lockFile = ../Cargo.lock;
      outputHashes = {
        # pimalaya/core git packages (all same rev b3a9640)
        "email-lib-0.27.0"   = "sha256-+zp0WPMZ3Y9PgWWzNAAuUNKFUF7c2VrDijI82pA8GJk=";
        "http-lib-0.1.0"     = "sha256-+zp0WPMZ3Y9PgWWzNAAuUNKFUF7c2VrDijI82pA8GJk=";
        "keyring-lib-1.0.3"  = "sha256-+zp0WPMZ3Y9PgWWzNAAuUNKFUF7c2VrDijI82pA8GJk=";
        "mml-lib-1.1.2"      = "sha256-+zp0WPMZ3Y9PgWWzNAAuUNKFUF7c2VrDijI82pA8GJk=";
        "oauth-lib-2.0.0"    = "sha256-+zp0WPMZ3Y9PgWWzNAAuUNKFUF7c2VrDijI82pA8GJk=";
        "pgp-lib-1.0.0"      = "sha256-+zp0WPMZ3Y9PgWWzNAAuUNKFUF7c2VrDijI82pA8GJk=";
        "process-lib-1.0.0"  = "sha256-+zp0WPMZ3Y9PgWWzNAAuUNKFUF7c2VrDijI82pA8GJk=";
        "secret-lib-1.0.1"   = "sha256-+zp0WPMZ3Y9PgWWzNAAuUNKFUF7c2VrDijI82pA8GJk=";
        # pimalaya/imap-client git package (rev 5600187)
        "imap-client-0.3.1"  = "sha256-TgmhgPVwv0MNSniejb7uCwbbjy2y8/e1mEJmOqzlMU0=";
        # pimalaya/io-email and io-maildir
        "io-email-0.0.1"     = "sha256-cXvItn/GvHlpCEhx9n53/GiTADakBk70/YTcowXB3m8=";
        "io-maildir-0.0.1"   = "sha256-mDuzb+/KkitAum3+KzaxJ7J6SH/CK38er0UjLtZqRGc=";
      };
    };
    cargoBuildFlags = [ "--package" "mailbrus-server" ];
    cargoTestFlags = [ "--package" "mailbrus-server" ];
    nativeBuildInputs = [ pkgs.pkg-config ];
    buildInputs = tauri-deps;
    doCheck = false;
  };
in
{
  inherit mailbrus mailbrus-frontend mailbrus-desktop mailbrus-server;
}
