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

        mailbrus-pkgs = import ./nix/pkgs.nix { inherit pkgs tauri-deps; };
        inherit (mailbrus-pkgs) mailbrus mailbrus-frontend mailbrus-desktop;
      in
      {
        packages = {
          default = mailbrus;
          inherit mailbrus mailbrus-frontend mailbrus-desktop;
        };

        devShells.default = import ./nix/devshell.nix {
          inherit pkgs tauri-deps dev-deps;
        };
      }
    );
}
