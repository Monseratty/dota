import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const config = readConfig();
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const lanMode = process.argv.includes("--lan");
const host = process.env.HOST_IP || (lanMode ? findLanAddress() : "localhost");
const apiBase = process.env.VITE_API_BASE || `auto (${host}:${config.apiPort})`;
const webEnv = process.env.VITE_API_BASE ? { VITE_API_BASE: process.env.VITE_API_BASE } : {};

console.log("[dev] starting Dota Replay Dashboard");
console.log(`[dev] api:    http://localhost:${config.apiPort}`);
console.log(`[dev] web:    http://localhost:${config.webPort}`);
if (lanMode) {
  console.log(`[dev] LAN:    http://${host}:${config.webPort}`);
}
console.log(`[dev] web -> API: ${apiBase}`);

const children = [
  start("api", ["--workspace", "apps/api", "run", "dev"]),
  start("worker", ["--workspace", "apps/worker", "run", "dev"]),
  start("web", ["--workspace", "apps/web", "run", "dev", "--", "--host", "0.0.0.0"], webEnv)
];

let shuttingDown = false;

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => shutdown(signal));
}

function start(name, args, env = {}) {
  const child = spawn(npm, args, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"]
  });

  child.stdout.on("data", (chunk) => write(name, chunk));
  child.stderr.on("data", (chunk) => write(name, chunk));
  child.on("exit", (code, signal) => {
    if (!shuttingDown && code !== 0) {
      console.error(`[dev] ${name} exited with code ${code ?? "null"} signal ${signal ?? "null"}`);
      shutdown("child-exit");
    }
  });

  return child;
}

function shutdown(reason) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  console.log(`\n[dev] stopping (${reason})`);
  for (const child of children) {
    if (!child.killed) {
      child.kill();
    }
  }
  setTimeout(() => process.exit(0), 300).unref();
}

function write(name, chunk) {
  const lines = String(chunk).split(/\r?\n/);
  for (const line of lines) {
    if (line.trim()) {
      console.log(`[${name}] ${line}`);
    }
  }
}

function readConfig() {
  const configPath = path.join(root, "config.json");
  const fallbackPath = path.join(root, "config.example.json");
  const filePath = fs.existsSync(configPath) ? configPath : fallbackPath;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function findLanAddress() {
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses || []) {
      if (address.family === "IPv4" && !address.internal) {
        return address.address;
      }
    }
  }
  return "localhost";
}
