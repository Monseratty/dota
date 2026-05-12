import fs from "node:fs";
import path from "node:path";
import type { AppConfig } from "../config/appConfig";

export class StorageService {
  constructor(private readonly config: AppConfig) {}

  storageInfo() {
    return {
      storagePath: this.config.storagePath,
      inboxPath: this.config.inboxPath,
      rawDemoPath: this.config.rawDemoPath,
      parsedPath: this.config.parsedPath,
      failedPath: this.config.failedPath,
      parserLogPath: this.config.parserLogPath,
      databasePath: this.config.databasePath
    };
  }

  listInboxDemos(): string[] {
    if (!fs.existsSync(this.config.inboxPath)) {
      return [];
    }

    return fs
      .readdirSync(this.config.inboxPath)
      .filter((name) => name.toLowerCase().endsWith(".dem"))
      .map((name) => path.join(this.config.inboxPath, name));
  }

  stat(filePath: string): fs.Stats | null {
    try {
      return fs.statSync(filePath);
    } catch {
      return null;
    }
  }

  moveInboxDemoToRaw(inboxFilePath: string): { rawFilePath: string; sourceFilename: string; fileSize: number } {
    const sourceFilename = path.basename(inboxFilePath);
    const parsed = path.parse(sourceFilename);
    const safeBase = sanitizeFileBase(parsed.name) || `demo-${Date.now()}`;
    let rawFilePath = path.join(this.config.rawDemoPath, `${safeBase}.dem`);
    let suffix = 2;

    while (fs.existsSync(rawFilePath)) {
      rawFilePath = path.join(this.config.rawDemoPath, `${safeBase}-${suffix}.dem`);
      suffix += 1;
    }

    fs.renameSync(inboxFilePath, rawFilePath);
    return {
      rawFilePath,
      sourceFilename,
      fileSize: fs.statSync(rawFilePath).size
    };
  }

  deleteRawFile(rawFilePath: string | null): void {
    if (!rawFilePath) {
      return;
    }
    const resolved = path.resolve(rawFilePath);
    if (!this.isInsideRawDemoPath(resolved)) {
      throw new Error("Refusing to delete a file outside raw demo storage");
    }
    if (fs.existsSync(resolved)) {
      fs.unlinkSync(resolved);
    }
  }

  deleteParsedData(matchDbId: number): void {
    const parsedDir = path.resolve(this.config.parsedPath, String(matchDbId));
    const root = path.resolve(this.config.parsedPath);
    if (!(parsedDir === root || parsedDir.startsWith(`${root}${path.sep}`))) {
      throw new Error("Refusing to delete parsed data outside parsed storage");
    }
    if (fs.existsSync(parsedDir)) {
      fs.rmSync(parsedDir, { recursive: true, force: true });
    }
  }

  isInsideRawDemoPath(filePath: string): boolean {
    const root = path.resolve(this.config.rawDemoPath);
    const resolved = path.resolve(filePath);
    return resolved === root || resolved.startsWith(`${root}${path.sep}`);
  }

  readDashboard(matchDbId: number): unknown | null {
    const dashboardPath = path.join(this.config.parsedPath, String(matchDbId), "dashboard.json");
    if (!fs.existsSync(dashboardPath)) {
      return null;
    }
    return JSON.parse(fs.readFileSync(dashboardPath, "utf8"));
  }

  readParserLog(jobId: number, maxBytes = 120_000): { exists: boolean; text: string; truncated: boolean } {
    const logPath = path.resolve(this.config.parserLogPath, `job-${jobId}.log`);
    const root = path.resolve(this.config.parserLogPath);
    if (!(logPath === root || logPath.startsWith(`${root}${path.sep}`))) {
      throw new Error("Refusing to read parser log outside parser log storage");
    }

    if (!fs.existsSync(logPath)) {
      return { exists: false, text: "", truncated: false };
    }

    const stat = fs.statSync(logPath);
    const start = Math.max(0, stat.size - maxBytes);
    const buffer = Buffer.alloc(stat.size - start);
    const fd = fs.openSync(logPath, "r");
    try {
      fs.readSync(fd, buffer, 0, buffer.length, start);
    } finally {
      fs.closeSync(fd);
    }

    return {
      exists: true,
      text: buffer.toString("utf8"),
      truncated: start > 0
    };
  }

  hasDashboard(matchDbId: number): boolean {
    return fs.existsSync(path.join(this.config.parsedPath, String(matchDbId), "dashboard.json"));
  }
}

function sanitizeFileBase(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
}
