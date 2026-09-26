#!/usr/bin/env node
// Stops the local dev servers: `npm run kill` from the repo root.
//   npm run kill              frontend (3001) + backend (8001)   [same as -a]
//   npm run kill -- -f        frontend only
//   npm run kill -- -b        backend only
// The Postgres Docker container is left running (`docker stop gramforgrow-db` to stop it).
import { spawnSync } from "node:child_process";

const IS_WIN = process.platform === "win32";

const TARGETS = {
  frontend: { ports: [3001], label: "frontend" },
  backend: { ports: [8001], label: "backend " },
};

const flags = new Set(process.argv.slice(2));
if (flags.has("-h") || flags.has("--help")) {
  console.log("Usage: npm run kill [-- -a | -f | -b]\n  -a, --all       frontend + backend (default)\n  -f, --frontend  frontend only (port 3001)\n  -b, --backend   backend only (port 8001)");
  process.exit(0);
}
const wantFront = flags.has("-f") || flags.has("--frontend");
const wantBack = flags.has("-b") || flags.has("--backend");
const selected = wantFront || wantBack ? [wantFront && "frontend", wantBack && "backend"].filter(Boolean) : ["frontend", "backend"];

const color = { ok: "\x1b[32m", warn: "\x1b[33m", err: "\x1b[31m", reset: "\x1b[0m" };
const say = (c, msg) => console.log(`${color[c]}[kill]${color.reset} ${msg}`);
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// ---------------------------------------------------------------------------------------------------------------------
// Process table + listeners
// ---------------------------------------------------------------------------------------------------------------------
/** pid -> { pid, ppid, name, cmd } */
function processTable() {
  const table = new Map();
  if (IS_WIN) {
    const r = spawnSync(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-Command", "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress"],
      { encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024 },
    );
    try {
      const rows = JSON.parse(r.stdout);
      for (const p of Array.isArray(rows) ? rows : [rows]) {
        table.set(p.ProcessId, { pid: p.ProcessId, ppid: p.ParentProcessId, name: (p.Name ?? "").toLowerCase(), cmd: p.CommandLine ?? "" });
      }
    } catch { /* leave empty: we then only kill the listener itself */ }
  } else {
    const r = spawnSync("ps", ["-eo", "pid=,ppid=,comm=,args="], { encoding: "utf8" });
    for (const line of r.stdout.split("\n")) {
      const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s*(.*)$/);
      if (m) table.set(Number(m[1]), { pid: Number(m[1]), ppid: Number(m[2]), name: m[3].toLowerCase(), cmd: m[4] });
    }
  }
  return table;
}

/** Returns [{ port, pid }] for everything listening on one of `ports`. */
function listeners(ports) {
  const found = [];
  if (IS_WIN) {
    const r = spawnSync("netstat", ["-ano", "-p", "tcp"], { encoding: "utf8", windowsHide: true });
    for (const line of r.stdout.split(/\r?\n/)) {
      const m = line.trim().match(/^TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)$/i);
      if (m && ports.includes(Number(m[1]))) found.push({ port: Number(m[1]), pid: Number(m[2]) });
    }
  } else {
    for (const port of ports) {
      const r = spawnSync("lsof", ["-ti", `tcp:${port}`, "-sTCP:LISTEN"], { encoding: "utf8" });
      for (const pid of r.stdout.split("\n").filter(Boolean)) found.push({ port, pid: Number(pid) });
    }
  }
  return found;
}

// ---------------------------------------------------------------------------------------------------------------------
// Which ancestors belong to the dev server?  `next dev` and `uvicorn --reload` both run under a parent supervisor
// (npm / the reloader / scripts/dev.mjs) that would respawn or keep the child alive, so the whole chain has to go.
// We only walk up through processes that clearly are part of that chain and stop at the first shell/terminal.
// ---------------------------------------------------------------------------------------------------------------------
function isDevChain(p) {
  const cmd = p.cmd;
  if (/^(node|node\.exe)$/.test(p.name)) return /next[\\/]|[\\/]\.bin[\\/]next|next dev|npm-cli|npm run|scripts[\\/]dev\.mjs/i.test(cmd);
  if (/^(python|python3|pythonw|python\.exe|pythonw\.exe|python3\.\d+)$/.test(p.name)) return /uvicorn|multiprocessing|app\.main/i.test(cmd);
  if (/^(cmd|cmd\.exe|sh|dash)$/.test(p.name)) return /npm|next|uvicorn/i.test(cmd);
  return false;
}

function ownChain(table) {
  const pids = new Set();
  for (let pid = process.pid; pid && !pids.has(pid); pid = table.get(pid)?.ppid) pids.add(pid);
  return pids;
}

function rootOf(pid, table, protectedPids) {
  let root = pid;
  for (;;) {
    const parent = table.get(table.get(root)?.ppid);
    if (!parent || protectedPids.has(parent.pid) || !isDevChain(parent)) return root;
    root = parent.pid;
  }
}

function killTree(pid) {
  if (IS_WIN) spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  else {
    try { process.kill(-pid, "SIGKILL"); } catch { /* not a group leader */ }
    try { process.kill(pid, "SIGKILL"); } catch { /* already gone */ }
  }
}

// ---------------------------------------------------------------------------------------------------------------------
const table = processTable();
const protectedPids = ownChain(table);
const allPorts = selected.flatMap((k) => TARGETS[k].ports);
const active = listeners(allPorts);

if (active.length === 0) {
  say("ok", `Nothing is listening on ${allPorts.join(", ")}.`);
  process.exit(0);
}

const roots = new Map(); // root pid -> [{ key, port }]
for (const { port, pid } of active) {
  if (protectedPids.has(pid)) continue;
  const key = selected.find((k) => TARGETS[k].ports.includes(port));
  const root = rootOf(pid, table, protectedPids);
  roots.set(root, [...(roots.get(root) ?? []), { key, port }]);
}

for (const [root, ports] of roots) {
  const p = table.get(root);
  const what = ports.map((x) => `${TARGETS[x.key].label.trim()} :${x.port}`).join(", ");
  say("warn", `Stopping ${what} - ${p?.name ?? "process"} (pid ${root})`);
  killTree(root);
}

sleep(700);
const still = listeners(allPorts);
if (still.length === 0) {
  say("ok", `Stopped. Ports ${allPorts.join(", ")} are free.`);
} else {
  for (const { port, pid } of still) killTree(pid); // last resort: the listener itself
  sleep(700);
  const left = listeners(allPorts);
  if (left.length === 0) say("ok", `Stopped. Ports ${allPorts.join(", ")} are free.`);
  else {
    say("err", `Still in use: ${left.map((l) => `:${l.port} (pid ${l.pid})`).join(", ")} - try closing that program manually.`);
    process.exit(1);
  }
}
