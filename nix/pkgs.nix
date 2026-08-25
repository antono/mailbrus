{ pkgs, tauri-deps, system }:
let
  mailbrus = pkgs.rustPlatform.buildRustPackage {
    pname = "mailbrus";
    version = "0.1.0";
    src = ../.;
    cargoHash = "sha256-a3dV7vSmDV7WQ5WPEvZNS6+SKJhSBvUF812Q69IUWyw=";
    cargoBuildFlags = [ "--package" "mailbrus-cli" ];
    nativeBuildInputs = [ pkgs.pkg-config ];
    buildInputs = tauri-deps;
    doCheck = false;
  };

  mailbrus-frontend = pkgs.stdenv.mkDerivation {
    pname = "mailbrus-frontend";
    version = "0.1.0";
    src = ../.;
    nativeBuildInputs = [ pkgs.deno ];
    preferLocalBuild = true;
    buildPhase = ''
      export DENO_DIR=$(mktemp -d)
      export npm_config_cache=$(mktemp -d)
      # TODO: vendor deno deps for fully hermetic build
      # Fixed-output derivation: network access allowed, output verified by hash
      deno install --allow-scripts
      deno task build
    '';
    installPhase = ''
      mkdir -p $out
      cp -r build/* $out
    '';
    outputHashMode = "recursive";
    outputHashAlgo = "sha256";
    outputHash = "sha256-3bB6go2t5SX/N2dxhxRq+33UJJfmTIYdd7y4+BHQB7k=";
  };

  mailbrus-desktop = pkgs.rustPlatform.buildRustPackage {
    pname = "mailbrus-desktop";
    version = "0.1.0";
    src = ../.;
    preferLocalBuild = true;
    cargoHash = "sha256-a3dV7vSmDV7WQ5WPEvZNS6+SKJhSBvUF812Q69IUWyw=";
    cargoBuildFlags = [ "--package" "mailbrus-desktop" ];
    # Tauri sets `dev = !custom-protocol`. Without this, buildRustPackage's plain
    # `cargo build` leaves dev=true, stripping the `#[cfg(not(dev))]` block in
    # src-tauri/src/lib.rs that spawns the server sidecar + injects the auth
    # token — the app then can't reach 127.0.0.1:1371. See src-tauri/Cargo.toml.
    buildFeatures = [ "custom-protocol" ];
    doCheck = false;
    nativeBuildInputs = [
      pkgs.pkg-config
      pkgs.wrapGAppsHook3
      pkgs.gobject-introspection
      pkgs.jq
      mailbrus-server
    ];
    buildInputs = tauri-deps ++ [ pkgs.gtk3 pkgs.gsettings-desktop-schemas pkgs.adwaita-icon-theme ];

    postPatch = ''
      jq '.build.devUrl = null | .build.frontendDist = "${mailbrus-frontend}"' src-tauri/tauri.conf.json > src-tauri/tauri.conf.json.tmp
      mv src-tauri/tauri.conf.json.tmp src-tauri/tauri.conf.json
      mkdir -p src-tauri/binaries
      ln -sf ${mailbrus-server}/bin/mailbrus-server src-tauri/binaries/mailbrus-server-${pkgs.stdenv.hostPlatform.config}
    '';

    TAURI_ENV_DEBUG = "false";

    postInstall = ''
      # Tauri on Linux resolves BaseDirectory::Resource to exe_dir/../lib/<app_name>/
      mkdir -p $out/lib/mailbrus-desktop/binaries
      ln -sf ${mailbrus-server}/bin/mailbrus-server $out/lib/mailbrus-desktop/binaries/mailbrus-server-${pkgs.stdenv.hostPlatform.config}

      mkdir -p $out/lib/mailbrus-desktop/build
      cp -r ${mailbrus-frontend}/* $out/lib/mailbrus-desktop/build/

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
    cargoHash = "sha256-a3dV7vSmDV7WQ5WPEvZNS6+SKJhSBvUF812Q69IUWyw=";
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
