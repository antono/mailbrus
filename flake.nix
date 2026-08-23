{
  description = "mailbrus: keyboard oriented email client";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
    }:
    # Linux only, deliberately. Every output pulls `tauri-deps`, which is a
    # Linux GTK stack (gtk3, webkitgtk_4_1, libsoup_3, dconf, glib-networking);
    # on macOS Tauri uses the system WKWebView and none of it applies. The
    # darwin outputs `eachDefaultSystem` used to advertise could not even
    # *evaluate* — webkitgtk carries `broken = hostPlatform.isDarwin`, so
    # forcing a darwin output fails with "Refusing to evaluate package
    # webkitgtk … broken". That is what has been failing every FlakeHub publish:
    # `flakehub-push` evaluates every output for every advertised system.
    #
    # Note `nix flake show --all-systems` does NOT catch this — it reports an
    # output's name and type without forcing its derivation inputs, so it passes
    # happily. Use `nix flake check --no-build --all-systems`, which instantiates
    # each derivation and therefore reproduces what the publish sees. The publish
    # workflow runs exactly that before handing off to flakehub-push.
    #
    # Adding darwin back means making `tauri-deps` platform-aware and giving the
    # non-Tauri outputs (CLI, server, frontend) their own minimal inputs — worth
    # doing, but it needs a darwin machine to verify, so it is out of scope here.
    flake-utils.lib.eachSystem [ "x86_64-linux" "aarch64-linux" ] (
      system:
      let
        pkgs = import nixpkgs { inherit system; };

        deps = import ./nix/deps.nix { inherit pkgs; };
        inherit (deps) tauri-deps dev-deps;

        mailbrus-pkgs = import ./nix/pkgs.nix { inherit pkgs tauri-deps system; };
        inherit (mailbrus-pkgs) mailbrus mailbrus-frontend mailbrus-desktop mailbrus-server;
      in
      {
        packages = {
          default = mailbrus;
          inherit mailbrus mailbrus-frontend mailbrus-server mailbrus-desktop;
        };

        devShells.default = import ./nix/devshell.nix {
          inherit pkgs tauri-deps dev-deps;
        };
      }
    );
}
