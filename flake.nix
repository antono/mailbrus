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
          inherit mailbrus mailbrus-frontend mailbrus-server;
          # `mailbrus-desktop` pulls in `webkitgtk_4_1` (via nix/deps.nix
          # tauri-deps), which was briefly marked broken in nixos-unstable
          # (webkitgtk-2.52.3+abi=4.1). That is resolved (2.52.5+ is unbroken on
          # both nixos-unstable and the pinned rev), so the output is enabled.
          inherit mailbrus-desktop;
        };

        devShells.default = import ./nix/devshell.nix {
          inherit pkgs tauri-deps dev-deps;
        };
      }
    );
}
