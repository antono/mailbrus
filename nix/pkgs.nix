{ pkgs, tauri-deps }:
let
  mailbrus = pkgs.rustPlatform.buildRustPackage {
    pname = "mailbrus";
    version = "0.1.0";
    src = ../.;
    cargoLock = {
      lockFile = ../Cargo.lock;
      outputHashes = {
        "io-email-0.0.1" = "sha256-cXvItn/GvHlpCEhx9n53/GiTADakBk70/YTcowXB3m8=";
      };
    };
    buildAndTestFocus = "mailbrus-cli";
    nativeBuildInputs = [ pkgs.pkg-config ];
    buildInputs = [ pkgs.openssl ];
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
        "io-email-0.0.1" = "sha256-cXvItn/GvHlpCEhx9n53/GiTADakBk70/YTcowXB3m8=";
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
in
{
  inherit mailbrus mailbrus-frontend mailbrus-desktop;
}
