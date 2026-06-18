#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run --allow-env --allow-net
/**
 * Build and start mailbrus-server with --browser for local development.
 *
 *   deno task server
 *
 * Builds the server binary (debug), starts it with --browser, and opens
 * the default web browser. Ctrl-C stops the server cleanly.
 */

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const SERVER_BIN = `${ROOT}/target/debug/mailbrus-server`;

function log(msg: string) {
  console.log(`[server] ${msg}`);
}

async function build(): Promise<boolean> {
  log("building mailbrus-server (debug)…");
  const { success } = await new Deno.Command("cargo", {
    args: ["build", "-p", "mailbrus-server"],
    cwd: ROOT,
    stdout: "inherit",
    stderr: "inherit",
  }).output();
  return success;
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
