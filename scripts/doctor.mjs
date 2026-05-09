import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const checks = [
  ["config.json", () => fs.existsSync(path.join(root, "config.json"))],
  ["vendor/clarity", () => fs.existsSync(path.join(root, "vendor", "clarity", "build.gradle.kts"))],
  ["gradle wrapper", () => fs.existsSync(path.join(root, "vendor", "clarity", process.platform === "win32" ? "gradlew.bat" : "gradlew"))],
  ["node", () => command("node", ["--version"])],
  ["npm", () => command(process.platform === "win32" ? "npm.cmd" : "npm", ["--version"])],
  ["java", () => command("java", ["-version"]) || hasJavaHome()]
];

let failed = false;

for (const [name, check] of checks) {
  const ok = check();
  console.log(`${ok ? "OK  " : "MISS"} ${name}`);
  failed ||= !ok;
}

if (failed) {
  console.log("\nSome checks failed. See README.md for setup instructions.");
  process.exit(1);
}

console.log("\nReady.");

function command(cmd, args) {
  const result = spawnSync(cmd, args, { stdio: "ignore" });
  return result.status === 0;
}

function hasJavaHome() {
  const candidates = [
    process.env.JAVA_HOME,
    process.platform === "darwin" ? "/opt/homebrew/Cellar/openjdk@17/17.0.19/libexec/openjdk.jdk/Contents/Home" : null
  ].filter(Boolean);

  return candidates.some((home) => fs.existsSync(path.join(home, "bin", process.platform === "win32" ? "java.exe" : "java")));
}
