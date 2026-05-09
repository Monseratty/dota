import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { AppConfig } from "../config";
import { projectRoot } from "../config";

export async function runClarityDump(config: AppConfig, rawFilePath: string, outputDir: string, jobId: number): Promise<void> {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(config.parserLogPath, { recursive: true });

  const root = projectRoot();
  const clarityDir = path.join(root, "vendor", "clarity");
  const logFile = path.join(config.parserLogPath, `job-${jobId}.log`);

  await runGradleTool(clarityDir, "runFullDemoDump", [rawFilePath, outputDir], logFile);
  await runGradleTool(clarityDir, "runFinalInventoryDump", [rawFilePath, path.join(outputDir, "final_inventory.json")], logFile);
  await runGradleTool(clarityDir, "runSkillBuildDump", [rawFilePath, path.join(outputDir, "skill_build.jsonl")], logFile);
}

function runGradleTool(cwd: string, task: string, args: string[], logFile: string): Promise<void> {
  const gradlew = path.join(cwd, process.platform === "win32" ? "gradlew.bat" : "gradlew");
  const javaHome = process.env.JAVA_HOME || defaultJavaHome();
  const child = spawn(gradlew, ["-q", task, "--args", args.map(quoteArg).join(" ")], {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      ...(javaHome ? { JAVA_HOME: javaHome, PATH: [path.join(javaHome, "bin"), process.env.PATH || ""].join(path.delimiter) } : {})
    }
  });

  const log = fs.createWriteStream(logFile, { flags: "a" });
  log.write(`\n[${new Date().toISOString()}] ${task} ${args.join(" ")}\n`);
  child.stdout.pipe(log, { end: false });
  child.stderr.pipe(log, { end: false });

  return new Promise((resolve, reject) => {
    child.on("error", (error) => {
      log.end();
      reject(error);
    });
    child.on("close", (code) => {
      log.end();
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${task} exited with code ${code}. See ${logFile}`));
      }
    });
  });
}

function quoteArg(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function defaultJavaHome(): string | null {
  if (process.platform === "darwin") {
    const homebrewJava = "/opt/homebrew/Cellar/openjdk@17/17.0.19/libexec/openjdk.jdk/Contents/Home";
    return fs.existsSync(homebrewJava) ? homebrewJava : null;
  }
  return null;
}
