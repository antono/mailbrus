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
    flake-utils.lib.eachDefaultSystem (
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
          inherit mailbrus mailbrus-frontend mailbrus-server;
          # NOTE: `mailbrus-desktop` is temporarily disabled. It pulls in
          # `webkitgtk_4_1` (via nix/deps.nix tauri-deps), and that package is
          # currently marked broken in nixos-unstable (webkitgtk-2.52.3+abi=4.1).
          # While broken, evaluating this output fails ("Refusing to evaluate
          # package ... because it has problems: broken"), which breaks
          # `flakehub-push` (it evaluates every output before publishing).
          # Re-enable once nixpkgs ships a fixed webkitgtk (`nix flake update nixpkgs`).
          # inherit mailbrus-desktop;
        };

        devShells.default = import ./nix/devshell.nix {
          inherit pkgs tauri-deps dev-deps;
        };
      }
    );
}
