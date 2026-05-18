## Context

Mailbrus is a greenfield keyboard-oriented email client. The cerbo project (password manager, same author) established a proven monorepo layout: shared Rust core crate, a CLI binary, a Tauri desktop binary, a SvelteKit frontend, and a Nix flake tying it all together. Mailbrus adopts this exact structure to reduce unknowns and reuse the same Nix plumbing.

## Goals / Non-Goals

**Goals:**
- Establish a compilable Cargo workspace with three crates: `mailbrus-core`, `mailbrus-cli`, `src-tauri`
- Wire `pimalaya/io-email` into `mailbrus-core`
- Produce a working `nix build` for all three packages (`mailbrus`, `mailbrus-desktop`, `mailbrus-frontend`)
- Provide a `nix develop` devShell for local development

**Non-Goals:**
- Any email functionality beyond `hello world` / placeholder implementations
- Authentication, IMAP/SMTP configuration, or UI screens
- CI/CD pipelines (separate change)

## Decisions

### 1. Mirror cerbo's Cargo workspace layout

**Decision:** `Cargo.toml` workspace with members `mailbrus-core`, `mailbrus-cli`, `src-tauri`.

**Rationale:** Cerbo proved this layout works cleanly with Nix's `rustPlatform.buildRustPackage` using a single `Cargo.lock` at workspace root. `buildAndTestFocus` isolates the Tauri build.

**Alternative considered:** Separate repos per binary — rejected due to `io-email` version synchronisation complexity.

### 2. `mailbrus-core` as the shared library crate

**Decision:** Both CLI and Tauri binary depend on `mailbrus-core` as a path dependency. All email logic lives there.

**Rationale:** Prevents duplication and ensures the CLI and GUI share identical behaviour. Mirrors `cerbo/core`.

### 3. `pimalaya/io-email` as the email backend

**Decision:** Add `email` crate from `https://github.com/pimalaya/io-email` to `mailbrus-core/Cargo.toml`.

**Rationale:** Pimalaya provides async IMAP/SMTP/Maildir abstractions purpose-built for Rust email clients.

**Risk:** io-email is not yet on crates.io — pinned via git in `Cargo.toml`, which requires `cargoLock.outputHashes` in the Nix package. Use the same pattern as cerbo does for git deps.

### 4. SvelteKit + Vite frontend, built via Deno

**Decision:** Frontend scaffold uses `deno.json` tasks (`dev`, `build`, `preview`) with `deno` as the package manager/runtime. Nix build uses `pkgs.deno`; no bun2nix overlay needed.

**Rationale:** Deno provides a single-binary toolchain (runtime + package manager + task runner) with a built-in lock file (`deno.lock`). Simpler than bun2nix and avoids the cerbo-specific bun overlay. `deno2nix` or `buildNpmPackage` via Deno's npm compat layer handles hermetic Nix builds.

### 5. Nix flake outputs: `mailbrus`, `mailbrus-desktop`, `mailbrus-frontend`

**Decision:** Three named packages, mirroring cerbo's `cerbo`, `cerbo-desktop`, `cerbo-frontend`. `default` = `mailbrus`. Flake inputs drop `bun2nix`; `deno` comes from nixpkgs.

**Rationale:** Users can install the CLI without the GUI. Desktop Nix build patches `tauri.conf.json` at build time to point `frontendDist` to the built frontend store path.

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------|
| `io-email` git dep breaks `nix build` without `outputHashes` | Generate hashes with `nix-prefetch-url` after adding dep; document in devshell |
| Tauri v2 API differences from cerbo's Tauri v1 | Check cerbo's `src-tauri/Cargo.toml` version; match or document delta |
| deno.lock drift | Re-run `deno install` to regenerate `deno.lock`; Nix build will fail fast on hash mismatch |

## Open Questions

- Does `io-email` expose a synchronous API or requires an async runtime? → Determines whether `mailbrus-core` needs `tokio`.
- Tauri v1 or v2? → Check cerbo and decide whether to track same version or move to v2.
