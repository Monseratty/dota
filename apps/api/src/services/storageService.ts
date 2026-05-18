import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { S3ObjectStorage } from "@dota-replay/shared/storage/s3ObjectStorage";
import type { AppConfig } from "../config/appConfig";

export class StorageService {
  private readonly remoteRawStorage: S3ObjectStorage | null;

  constructor(private readonly config: AppConfig) {
    this.remoteRawStorage = config.replayStorage.driver === "s3" ? new S3ObjectStorage(config.replayStorage.s3) : null;
  }

  storageInfo() {
    return {
      storagePath: this.config.storagePath,
      inboxPath: this.config.inboxPath,
      rawDemoPath: this.config.rawDemoPath,
      tempDemoPath: this.config.tempDemoPath,
      parsedPath: this.config.parsedPath,
      failedPath: this.config.failedPath,
      parserLogPath: this.config.parserLogPath,
      databasePath: this.config.databasePath,
      replayStorage: this.config.replayStorage.driver === "s3" ? {
        driver: "s3",
        endpoint: this.config.replayStorage.s3.endpoint,
        region: this.config.replayStorage.s3.region,
        bucket: this.config.replayStorage.s3.bucket,
        uploadPrefix: this.config.replayStorage.s3.uploadPrefix,
        directUploadPrefix: this.config.replayStorage.s3.directUploadPrefix
      } : {
        driver: "local"
      }
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

  async uploadRawFile(matchDbId: number, rawFilePath: string, sourceFilename: string): Promise<{ key: string } | null> {
    if (!this.remoteRawStorage) {
      return null;
    }
    const key = this.remoteRawKey(matchDbId, sourceFilename);
    await this.remoteRawStorage.putFile(rawFilePath, key);
    return { key };
  }

  createRemoteUpload(filename: string): { uploadId: string; key: string; url: string; headers: Record<string, string> } {
    if (!this.remoteRawStorage || this.config.replayStorage.driver !== "s3") {
      throw new Error("S3 replay storage is not enabled");
    }
    const uploadId = cryptoRandomId();
    const key = this.remoteUploadKey(uploadId, filename);
    return {
      uploadId,
      key,
      url: this.remoteRawStorage.createPresignedPutUrl(key),
      headers: {
        "content-type": "application/octet-stream"
      }
    };
  }

  tempRawFilePath(uploadId: string, sourceFilename: string): string {
    const safeBase = sanitizeFileBase(path.parse(sourceFilename).name) || "upload";
    const safeId = sanitizeFileBase(uploadId) || cryptoRandomId();
    return path.join(this.config.tempDemoPath, `${safeId}-${safeBase}.dem`);
  }

  async restoreRawFile(rawFilePath: string | null, rawStorageKey: string | null): Promise<boolean> {
    if (!rawFilePath || !rawStorageKey || !this.remoteRawStorage) {
      return false;
    }

    const resolved = path.resolve(rawFilePath);
    if (!this.isInsideRawDemoPath(resolved)) {
      throw new Error("Refusing to restore a file outside raw demo storage");
    }
    if (fs.existsSync(resolved)) {
      return true;
    }
    await this.remoteRawStorage.downloadToFile(rawStorageKey, resolved);
    return true;
  }

  async deleteRawFile(rawFilePath: string | null, rawStorageKey?: string | null): Promise<void> {
    if (rawFilePath) {
      const resolved = path.resolve(rawFilePath);
      if (!this.isInsideRawDemoPath(resolved)) {
        throw new Error("Refusing to delete a file outside raw demo storage");
      }
      if (fs.existsSync(resolved)) {
        fs.unlinkSync(resolved);
      }
    }

    if (rawStorageKey && this.remoteRawStorage) {
      await this.remoteRawStorage.deleteObject(rawStorageKey);
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
    const resolved = path.resolve(filePath);
    return [this.config.rawDemoPath, this.config.tempDemoPath].some((folder) => {
      const root = path.resolve(folder);
      return resolved === root || resolved.startsWith(`${root}${path.sep}`);
    });
  }

  hasLocalRawFile(rawFilePath: string | null): boolean {
    if (!rawFilePath) {
      return false;
    }
    const resolved = path.resolve(rawFilePath);
    return this.isInsideRawDemoPath(resolved) && fs.existsSync(resolved);
  }

  localRawStat(rawFilePath: string | null): fs.Stats | null {
    return rawFilePath && this.hasLocalRawFile(rawFilePath) ? fs.statSync(rawFilePath) : null;
  }

  createLocalRawStream(rawFilePath: string): fs.ReadStream {
    const resolved = path.resolve(rawFilePath);
    if (!this.isInsideRawDemoPath(resolved) || !fs.existsSync(resolved)) {
      throw new Error("Replay file is not available locally");
    }
    return fs.createReadStream(resolved);
  }

  createRemoteDownloadUrl(rawStorageKey: string, filename: string): string | null {
    if (!this.remoteRawStorage) {
      return null;
    }
    return this.remoteRawStorage.createPresignedGetUrl(rawStorageKey, filename);
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

  private remoteRawKey(matchDbId: number, sourceFilename: string): string {
    const now = new Date();
    const yyyy = String(now.getUTCFullYear());
    const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(now.getUTCDate()).padStart(2, "0");
    const parsed = path.parse(sourceFilename);
    const safeBase = sanitizeFileBase(parsed.name) || `match-${matchDbId}`;
    const prefix = this.config.replayStorage.driver === "s3" ? this.config.replayStorage.s3.uploadPrefix : "raw";
    return [prefix, yyyy, mm, dd, `${matchDbId}-${safeBase}.dem`]
      .map((part) => part.replace(/^\/+|\/+$/g, ""))
      .filter(Boolean)
      .join("/");
  }

  private remoteUploadKey(uploadId: string, sourceFilename: string): string {
    const now = new Date();
    const yyyy = String(now.getUTCFullYear());
    const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(now.getUTCDate()).padStart(2, "0");
    const safeBase = sanitizeFileBase(path.parse(sourceFilename).name) || "upload";
    const prefix = this.config.replayStorage.driver === "s3" ? this.config.replayStorage.s3.directUploadPrefix : "incoming";
    return [prefix, yyyy, mm, dd, `${uploadId}-${safeBase}.dem`]
      .map((part) => part.replace(/^\/+|\/+$/g, ""))
      .filter(Boolean)
      .join("/");
  }
}

function sanitizeFileBase(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
}

function cryptoRandomId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}
