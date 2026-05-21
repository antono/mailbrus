{
  description = "mailbrus: keyboard oriented email client";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    io-email.url = "github:pimalaya/io-email";
    io-maildir.url = "github:pimalaya/io-maildir";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
      io-email,
      io-maildir,
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs { inherit system; };

        deps = import ./nix/deps.nix { inherit pkgs; };
        inherit (deps) tauri-deps dev-deps;

        mailbrus-pkgs = import ./nix/pkgs.nix { inherit pkgs tauri-deps io-email io-maildir system; };
        inherit (mailbrus-pkgs) mailbrus mailbrus-frontend mailbrus-desktop mailbrus-server;
      in
      {
        packages = {
          default = mailbrus;
          inherit mailbrus mailbrus-frontend mailbrus-desktop mailbrus-server;
        };

        devShells.default = import ./nix/devshell.nix {
          inherit pkgs tauri-deps dev-deps;
        };
      }
    );
}
