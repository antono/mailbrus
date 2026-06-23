#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run --allow-env --allow-net
/**
 * Build and start mailbrus-server with --browser for local development.
 *
 *   deno task server
 *
 * Rebuilds BOTH the SPA (vite → `build/`) and the server binary (debug), then
 * starts the server with --browser and opens the default web browser. Ctrl-C
 * stops the server cleanly.
 *
 * The SPA rebuild is mandatory: the server serves the static `build/` dir, whose
 * `index.html` references content-hashed chunks (e.g. `chunks/B6yxSejh.js`). If
 * `build/` is stale relative to the source, the browser requests chunks that no
 * longer exist and the app fails to boot ("error loading dynamically imported
 * module"). Rebuilding every launch keeps the served SPA and server in lockstep.
 */

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const SERVER_BIN = `${ROOT}/target/debug/mailbrus-server`;

function log(msg: string) {
  console.log(`[server] ${msg}`);
}

/** Build one component; returns whether it succeeded. */
async function run(label: string, cmd: string, args: string[]): Promise<boolean> {
  log(`building ${label}…`);
  const { success } = await new Deno.Command(cmd, {
    args,
    cwd: ROOT,
    stdout: "inherit",
    stderr: "inherit",
  }).output();
  return success;
}

/** Rebuild the SPA and the server binary concurrently (they are independent). */
async function build(): Promise<boolean> {
  const [spa, server] = await Promise.all([
    run("SPA (vite build → build/)", "deno", ["task", "build"]),
    run("mailbrus-server (debug)", "cargo", ["build", "-p", "mailbrus-server"]),
  ]);
  if (!spa) log("SPA build failed");
  if (!server) log("server build failed");
  return spa && server;
}

function start(proc: Deno.ChildProcess) {
  proc.status.then((s) => {
    log(`server exited with code ${s.code}`);
    Deno.exit(s.code ?? 1);
  }).catch(() => {});
}

if (!await build()) {
  log("build failed");
  Deno.exit(1);
}

log("starting server with --browser");
const child = new Deno.Command(SERVER_BIN, {
  args: ["--browser"],
  cwd: ROOT,
  stdout: "inherit",
  stderr: "inherit",
}).spawn();

start(child);

const stop = () => {
  log("shutting down…");
  try { child.kill("SIGTERM"); } catch { /* already gone */ }
};
Deno.addSignalListener("SIGINT", stop);
Deno.addSignalListener("SIGTERM", stop);

await child.status;
