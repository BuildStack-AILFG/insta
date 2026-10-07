#!/usr/bin/env node
// One-command local dev: `npm run dev` from the repo root.
//   1. Database  - starts (or creates) the local Postgres Docker container and waits until it accepts connections
//   2. Backend   - creates the venv / installs deps if missing, runs migrations + plan seed, starts uvicorn --reload
//   3. Frontend  - installs deps if missing, starts `next dev`
// Ctrl+C stops the backend and frontend. The database container keeps running (`docker stop gramforgrow-db`).
import { spawn, spawnSync } from "node:child_process";
import { existsSync, copyFileSync, readFileSync, writeFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BACKEND = path.join(ROOT, "backend");
const FRONTEND = path.join(ROOT, "frontend");
const IS_WIN = process.platform === "win32";

const DB = { container: "gramforgrow-db", volume: "gramforgrow-db-data", image: "postgres:16", user: "gramforgrow", name: "gramforgrow" };
const BACKEND_PORT = 8001;

const color = { db: "\x1b[32m", backend: "\x1b[36m", frontend: "\x1b[35m", dev: "\x1b[33m", err: "\x1b[31m", reset: "\x1b[0m" };
const log = (tag, msg) => console.log(`${color[tag] ?? ""}[${tag}]${color.reset} ${msg}`);
const fail = (msg) => {
  console.error(`${color.err}[dev] ${msg}${color.reset}`);
  process.exit(1);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Runs a command to completion, streaming its output with a tag prefix. Resolves with the exit code. */
function run(tag, cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], ...opts });
    pipeLines(tag, child);
    child.on("error", (e) => {
      log(tag, `${color.err}${e.message}${color.reset}`);
      resolve(1);
    });
    child.on("close", (code) => resolve(code ?? 1));
  });
}

/** Runs a command quietly and returns { ok, out }. */
function probe(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: "utf8", windowsHide: true });
  return { ok: r.status === 0, out: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim() };
}

function pipeLines(tag, child) {
  for (const stream of [child.stdout, child.stderr]) {
    let buf = "";
    stream?.on("data", (chunk) => {
      buf += chunk.toString();
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? "";
      for (const line of lines) if (line.trim()) log(tag, line);
    });
    stream?.on("end", () => buf.trim() && log(tag, buf));
  }
}

function portOpen(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const s = net.connect({ port, host });
    s.once("connect", () => (s.destroy(), resolve(true)));
    s.once("error", () => resolve(false));
    s.setTimeout(1000, () => (s.destroy(), resolve(false)));
  });
}

async function waitFor(check, { timeoutMs, everyMs = 1500 }) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await check()) return true;
    await sleep(everyMs);
  }
  return false;
}

// ---------------------------------------------------------------------------------------------------------------------
// 1. Database
// ---------------------------------------------------------------------------------------------------------------------
function databaseTarget() {
  const envFile = path.join(BACKEND, ".env");
  const text = existsSync(envFile) ? readFileSync(envFile, "utf8") : "";
  const line = text.split(/\r?\n/).find((l) => l.startsWith("DATABASE_URL="));
  if (!line) return { host: "localhost", port: 5434, password: "" };
  try {
    const url = new URL(line.slice("DATABASE_URL=".length).trim().replace(/^postgresql\+asyncpg/, "postgresql"));
    return { host: url.hostname, port: Number(url.port || 5434), password: decodeURIComponent(url.password) };
  } catch {
    return { host: "localhost", port: 5434, password: "" };
  }
}

async function ensureDockerRunning() {
  if (probe("docker", ["info"]).ok) return;
  if (!probe("docker", ["--version"]).ok) fail("Docker is not installed. Install Docker Desktop, or point DATABASE_URL in backend/.env at a running Postgres.");

  const desktop = "C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe";
  if (IS_WIN && existsSync(desktop)) {
    log("db", "Docker isn't running - starting Docker Desktop (this can take a minute)...");
    spawn(desktop, [], { detached: true, stdio: "ignore" }).unref();
    if (await waitFor(() => probe("docker", ["info"]).ok, { timeoutMs: 120_000, everyMs: 3000 })) return;
  }
  fail("Docker isn't running. Start Docker Desktop and run `npm run dev` again.");
}

async function ensureDatabase() {
  const { host, port, password } = databaseTarget();
  if (!password) fail("DATABASE_URL in backend/.env needs a password for the gramforgrow Postgres user.");
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
    log("db", `DATABASE_URL points at ${host} - not managing a local container.`);
    return;
  }

  await ensureDockerRunning();

  // Only ever reuse our own container: something else on this port (e.g. another project's Postgres) is an error, not a match.
  const running = probe("docker", ["ps", "--filter", `name=^${DB.container}$`, "--format", "{{.Names}}"]).out.trim() === DB.container;
  if (running) {
    log("db", `${DB.container} already running on localhost:${port}.`);
    return;
  }
  if (await portOpen(port)) fail(`Port ${port} is used by something other than ${DB.container}. DMForGrow needs its own Postgres - free the port or change it in backend/.env.`);

  const exists = probe("docker", ["ps", "-a", "--filter", `name=^${DB.container}$`, "--format", "{{.Names}}"]).out.trim() === DB.container;
  if (exists) {
    log("db", `Starting container ${DB.container}...`);
    const r = probe("docker", ["start", DB.container]);
    if (!r.ok) fail(`Could not start ${DB.container}: ${r.out}`);
  } else {
    log("db", `Creating container ${DB.container} (${DB.image})...`);
    const code = await run("db", "docker", [
      "run", "--name", DB.container, "-d",
      "-e", `POSTGRES_USER=${DB.user}`, "-e", `POSTGRES_PASSWORD=${password}`, "-e", `POSTGRES_DB=${DB.name}`,
      "-p", `${port}:5432`, "-v", `${DB.volume}:/var/lib/postgresql/data`, DB.image,
    ]);
    if (code !== 0) fail("Could not create the Postgres container (is another program using port " + port + "?).");
  }

  log("db", "Waiting for Postgres to be ready...");
  const ready = await waitFor(() => probe("docker", ["exec", DB.container, "pg_isready", "-U", DB.user, "-d", DB.name]).ok, { timeoutMs: 60_000, everyMs: 1000 });
  if (!ready) fail("Postgres did not become ready within 60s. Check `docker logs " + DB.container + "`.");
  log("db", "Postgres is ready.");
}

// ---------------------------------------------------------------------------------------------------------------------
// 2. Backend / 3. Frontend setup
// ---------------------------------------------------------------------------------------------------------------------
const venvPython = path.join(BACKEND, ".venv", IS_WIN ? "Scripts/python.exe" : "bin/python");

async function prepareBackend() {
  if (!existsSync(path.join(BACKEND, ".env"))) {
    log("backend", "backend/.env missing - copying .env.example (edit the secrets before deploying anywhere).");
    copyFileSync(path.join(BACKEND, ".env.example"), path.join(BACKEND, ".env"));
  }

  // The pinned requirements have wheels for Python 3.12 — prefer it via the Windows launcher when several Pythons are installed.
  if (!existsSync(venvPython)) {
    log("backend", "Creating virtualenv (first run only)...");
    const [py, pyArgs] = IS_WIN && probe("py", ["-3.12", "--version"]).ok ? ["py", ["-3.12"]] : [IS_WIN ? "python" : "python3", []];
    if ((await run("backend", py, [...pyArgs, "-m", "venv", ".venv"], { cwd: BACKEND })) !== 0) fail("Could not create the backend virtualenv (is Python 3.12 installed?).");
  }
  // Marker written only after a successful install, so a failed install is retried on the next run instead of skipped.
  const installedMarker = path.join(BACKEND, ".venv", ".requirements-installed");
  if (!existsSync(installedMarker)) {
    log("backend", "Installing backend requirements...");
    if ((await run("backend", venvPython, ["-m", "pip", "install", "-r", "requirements.txt"], { cwd: BACKEND })) !== 0) fail("pip install failed.");
    writeFileSync(installedMarker, new Date().toISOString());
  }

  log("backend", "Applying database migrations...");
  if ((await run("backend", venvPython, ["-m", "alembic", "upgrade", "head"], { cwd: BACKEND })) !== 0) fail("Migrations failed - see the output above.");
  if ((await run("backend", venvPython, ["scripts/seed_plans.py"], { cwd: BACKEND })) !== 0) fail("Seeding plans failed - see the output above.");
}

async function prepareFrontend() {
  if (existsSync(path.join(FRONTEND, "node_modules"))) return;
  log("frontend", "Installing npm dependencies (first run only)...");
  if ((await run("frontend", "npm install", [], { cwd: FRONTEND, shell: true })) !== 0) fail("npm install failed in frontend/.");
}

// ---------------------------------------------------------------------------------------------------------------------
// Long-running processes
// ---------------------------------------------------------------------------------------------------------------------
const children = [];
let shuttingDown = false;

function killTree(child) {
  if (!child.pid || child.exitCode !== null) return;
  if (IS_WIN) spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  else {
    try { process.kill(-child.pid, "SIGTERM"); } catch { /* already gone */ }
  }
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  log("dev", "Stopping backend and frontend...");
  children.forEach(killTree);
  setTimeout(() => process.exit(code), 500);
}

function start(tag, cmd, args, opts) {
  const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], detached: !IS_WIN, ...opts });
  children.push(child);
  pipeLines(tag, child);
  child.on("error", (e) => {
    log(tag, `${color.err}${e.message}${color.reset}`);
    shutdown(1);
  });
  child.on("close", (code) => {
    if (shuttingDown) return;
    log(tag, `${color.err}exited with code ${code} - stopping everything.${color.reset}`);
    shutdown(code || 1);
  });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

// ---------------------------------------------------------------------------------------------------------------------
console.log(`${color.dev}DMForGrow - local dev${color.reset}\n`);

if (await portOpen(BACKEND_PORT)) fail(`Port ${BACKEND_PORT} is already in use - stop whatever is running there (an old backend?) and try again.`);

await ensureDatabase();
await prepareBackend();
await prepareFrontend();

start("backend", venvPython, ["-m", "uvicorn", "app.main:app", "--reload", "--port", String(BACKEND_PORT)], {
  cwd: BACKEND,
  env: { ...process.env, PYTHONUNBUFFERED: "1" },
});
start("frontend", "npm run dev -- --port 3001", [], { cwd: FRONTEND, shell: true });

console.log(`
${color.dev}Frontend${color.reset}  http://localhost:3001
${color.dev}Backend${color.reset}   http://localhost:8001/api/health   (docs: /docs)
${color.dev}Database${color.reset}  localhost:5434 / gramforgrow (container ${DB.container})
Press Ctrl+C to stop.
`);
