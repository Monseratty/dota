import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { AppConfig } from "../config";
import { projectRoot } from "../config";

export async function runClarityDump(config: AppConfig, rawFilePath: string, outputDir: string, jobId: number): Promise<void> {
  const resolvedRawFilePath = path.resolve(rawFilePath);
  const resolvedOutputDir = path.resolve(outputDir);
  fs.mkdirSync(resolvedOutputDir, { recursive: true });
  fs.mkdirSync(config.parserLogPath, { recursive: true });

  const root = projectRoot();
  const clarityDir = path.join(root, "vendor", "clarity");
  const logFile = path.join(config.parserLogPath, `job-${jobId}.log`);

  if (process.env.CLARITY_RUNNER === "gradle") {
    await runGradleTool(clarityDir, "runDashboardDump", [resolvedRawFilePath, resolvedOutputDir], logFile);
    return;
  }

  await runJavaDashboardDump(clarityDir, resolvedRawFilePath, resolvedOutputDir, logFile);
}

function runGradleTool(cwd: string, task: string, args: string[], logFile: string): Promise<void> {
  const gradlew = path.join(cwd, process.platform === "win32" ? "gradlew.bat" : "gradlew");
  const javaHome = process.env.JAVA_HOME || defaultJavaHome();
  const commandArgs = ["--no-daemon", "-q", task];
  if (args.length > 0) {
    commandArgs.push("--args", args.map(quoteArg).join(" "));
  }
  const child = spawn(gradlew, commandArgs, {
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

async function runJavaDashboardDump(cwd: string, rawFilePath: string, outputDir: string, logFile: string): Promise<void> {
  const classpath = await ensureRuntimeClasspath(cwd, logFile);
  const javaHome = process.env.JAVA_HOME || defaultJavaHome();
  const javaBin = javaHome ? path.join(javaHome, "bin", process.platform === "win32" ? "java.exe" : "java") : "java";
  const args = [
    ...javaRuntimeArgs(),
    "-cp",
    classpath,
    "skadistats.clarity.tools.DashboardDump",
    rawFilePath,
    outputDir
  ];

  await runProcess(javaBin, args, cwd, logFile, "DashboardDump", {
    ...process.env,
    ...(javaHome ? { JAVA_HOME: javaHome, PATH: [path.join(javaHome, "bin"), process.env.PATH || ""].join(path.delimiter) } : {})
  });
}

async function ensureRuntimeClasspath(cwd: string, logFile: string): Promise<string> {
  const classpathFile = path.join(cwd, "build", "runtime-classpath.txt");
  const dashboardClass = path.join(cwd, "build", "classes", "java", "main", "skadistats", "clarity", "tools", "DashboardDump.class");
  if (runtimeClasspathNeedsRefresh(cwd, classpathFile, dashboardClass)) {
    await runGradleTool(cwd, "writeRuntimeClasspath", [], logFile);
  }

  return fs.readFileSync(classpathFile, "utf8").trim();
}

function runtimeClasspathNeedsRefresh(cwd: string, classpathFile: string, dashboardClass: string): boolean {
  if (!fs.existsSync(classpathFile) || !fs.existsSync(dashboardClass)) {
    return true;
  }

  const classpathMtime = fs.statSync(classpathFile).mtimeMs;
  const watchedFiles = [
    path.join(cwd, "build.gradle.kts"),
    ...fs.readdirSync(path.join(cwd, "src", "main", "java", "skadistats", "clarity", "tools"))
      .filter((file) => file.endsWith(".java"))
      .map((file) => path.join(cwd, "src", "main", "java", "skadistats", "clarity", "tools", file))
  ];
  return watchedFiles.some((file) => fs.existsSync(file) && fs.statSync(file).mtimeMs > classpathMtime);
}

function runProcess(
  command: string,
  args: string[],
  cwd: string,
  logFile: string,
  label: string,
  env: NodeJS.ProcessEnv
): Promise<void> {
  const child = spawn(command, args, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    env
  });

  const log = fs.createWriteStream(logFile, { flags: "a" });
  log.write(`\n[${new Date().toISOString()}] ${label} ${args.map((arg) => (arg.includes(" ") ? quoteArg(arg) : arg)).join(" ")}\n`);
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
        reject(new Error(`${label} exited with code ${code}. See ${logFile}`));
      }
    });
  });
}

function javaRuntimeArgs(): string[] {
  const maxHeap = process.env.CLARITY_JAVA_XMX || "512m";
  const extra = (process.env.CLARITY_JAVA_OPTS || "").split(/\s+/).filter(Boolean);
  return [
    "-Xms64m",
    `-Xmx${maxHeap}`,
    "-XX:+UseSerialGC",
    "-Dfile.encoding=UTF-8",
    ...extra
  ];
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
