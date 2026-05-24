#!/usr/bin/env -S deno run --allow-run --allow-read --allow-write --allow-env --allow-net
// Dev watcher: rebuilds Rust/Svelte on change and restarts the server.

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const SERVER_BIN = `${ROOT}/target/debug/mailbrus-server`;

let server: Deno.ChildProcess | null = null;
let busy = false;
let pending = { rust: false, svelte: false };
let debounceTimer: number | null = null;

function log(msg: string) {
  console.log(`[watch] ${msg}`);
}

async function run(label: string, cmd: string, args: string[]): Promise<boolean> {
  log(label);
  const { success } = await new Deno.Command(cmd, {
    args,
    cwd: ROOT,
    stdout: "inherit",
    stderr: "inherit",
  }).output();
  return success;
}

async function stopServer() {
  if (!server) return;
  log("stopping server");
  try {
    server.kill("SIGTERM");
    await Promise.race([
      server.status,
      new Promise<void>((r) => setTimeout(r, 3000)),
    ]);
  } catch (_) { /* already dead */ }
  server = null;
}

function startServer() {
  log("starting server");
  server = new Deno.Command(SERVER_BIN, {
    args: [],
    cwd: ROOT,
    stdout: "inherit",
    stderr: "inherit",
  }).spawn();

  // Log when server exits unexpectedly
  server.status.then((s) => {
    if (server !== null) log(`server exited with code ${s.code}`);
  }).catch(() => {});
}

async function doBuild() {
  if (busy) return;

  const doRust = pending.rust;
  const doSvelte = pending.svelte;
  pending.rust = false;
  pending.svelte = false;

  if (!doRust && !doSvelte) return;

  busy = true;
  try {
    if (doRust) {
      const ok = await run(
        "cargo build -p mailbrus-server",
        "cargo", ["build", "-p", "mailbrus-server"],
      );
      if (!ok) { log("rust build failed — server not restarted"); return; }
    }
    if (doSvelte) {
      const ok = await run(
        "vite build",
        "node_modules/.bin/vite", ["build"],
      );
      if (!ok) { log("svelte build failed — server not restarted"); return; }
    }
    await stopServer();
    startServer();
  } finally {
    busy = false;
    if (pending.rust || pending.svelte) {
      doBuild();
    }
  }
}

function schedule(rust: boolean, svelte: boolean) {
  if (rust) pending.rust = true;
  if (svelte) pending.svelte = true;
  if (debounceTimer !== null) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => { debounceTimer = null; doBuild(); }, 300);
}

// --- file watchers ---

const RUST_IGNORE = ["/target/", "Cargo.lock"];
const SVELTE_IGNORE = ["/.svelte-kit/", "/build/", "/node_modules/"];

function shouldIgnore(path: string, patterns: string[]): boolean {
  return patterns.some((p) => path.includes(p));
}

async function watchRust() {
  const watcher = Deno.watchFs([
    `${ROOT}/mailbrus-core/src`,
    `${ROOT}/mailbrus-server/src`,
    `${ROOT}/mailbrus-core/Cargo.toml`,
    `${ROOT}/mailbrus-server/Cargo.toml`,
    `${ROOT}/Cargo.toml`,
  ]);
  for await (const event of watcher) {
    if (event.kind !== "modify" && event.kind !== "create") continue;
    const path = event.paths[0];
    if (shouldIgnore(path, RUST_IGNORE)) continue;
    log(`rust change: ${path.replace(ROOT, "")}`);
    schedule(true, false);
  }
}

async function watchSvelte() {
  const watcher = Deno.watchFs([
    `${ROOT}/src`,
    `${ROOT}/static`,
    `${ROOT}/svelte.config.js`,
    `${ROOT}/vite.config.js`,
  ]);
  for await (const event of watcher) {
    if (event.kind !== "modify" && event.kind !== "create") continue;
    const path = event.paths[0];
    if (shouldIgnore(path, SVELTE_IGNORE)) continue;
    log(`svelte change: ${path.replace(ROOT, "")}`);
    schedule(false, true);
  }
}

// --- initial build and start ---

log("initial rust build");
if (!await run("cargo build -p mailbrus-server", "cargo", ["build", "-p", "mailbrus-server"])) {
  log("initial rust build failed");
  Deno.exit(1);
}

log("initial svelte build");
if (!await run("vite build", "node_modules/.bin/vite", ["build"])) {
  log("initial svelte build failed");
  Deno.exit(1);
}

startServer();

// Clean up server on exit
const cleanup = async () => { await stopServer(); Deno.exit(0); };
Deno.addSignalListener("SIGINT", cleanup);
Deno.addSignalListener("SIGTERM", cleanup);

await Promise.all([watchRust(), watchSvelte()]);
