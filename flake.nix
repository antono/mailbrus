{
  description = "mailbrus: keyboard oriented email client";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    bun2nix.url = "github:nix-community/bun2nix";
    bun2nix.inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
      bun2nix,
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs {
          inherit system;
          overlays = [ bun2nix.overlays.default ];
        };

        deps = import ./nix/deps.nix { inherit pkgs; };
        inherit (deps) tauri-deps dev-deps;

        cerbo-pkgs = import ./nix/pkgs.nix { inherit pkgs tauri-deps; };
        inherit (cerbo-pkgs) cerbo cerbo-frontend cerbo-desktop;

        src = builtins.path {
          path = ./.;
          name = "cerbo-src";
        };
        releaseWorkflowCheck = pkgs.writeShellApplication {
          name = "release-workflow-check";
          runtimeInputs = [ pkgs.actionlint ];
          text = ''
            actionlint ${src}/.github/workflows/release.yml
          '';
        };
      in
      {
        packages = {
          default = cerbo;
          inherit cerbo cerbo-frontend cerbo-desktop;
          release-workflow-check = releaseWorkflowCheck;
        };

        checks.release-workflow =
          pkgs.runCommand "release-workflow-check"
            {
              nativeBuildInputs = [ pkgs.actionlint ];
            }
            ''
              ${releaseWorkflowCheck}/bin/release-workflow-check
              touch $out
            '';

        apps.release-workflow-check = {
          type = "app";
          program = "${releaseWorkflowCheck}/bin/release-workflow-check";
        };

        devShells.default = import ./nix/devshell.nix {
          inherit pkgs tauri-deps dev-deps;
        };
      }
    );
}
