import path from "node:path";
import type { JobsRepository } from "../repositories/jobsRepository";
import type { MatchesRepository } from "../repositories/matchesRepository";
import type { StorageService } from "../services/storageService";

interface ScanResult {
  scanned: number;
  imported: number;
  skipped: Array<{ file: string; reason: string }>;
}

export class WatchFolderScanner {
  private inFlight = false;

  constructor(
    private readonly storage: StorageService,
    private readonly matches: MatchesRepository,
    private readonly jobs: JobsRepository,
    private readonly stableCheckSeconds: number
  ) {}

  start(intervalSeconds: number): void {
    void this.scan();
    setInterval(() => {
      void this.scan();
    }, intervalSeconds * 1000).unref();
  }

  async scan(): Promise<ScanResult> {
    if (this.inFlight) {
      return { scanned: 0, imported: 0, skipped: [{ file: "*", reason: "scan already running" }] };
    }

    this.inFlight = true;
    const result: ScanResult = { scanned: 0, imported: 0, skipped: [] };

    try {
      const files = this.storage.listInboxDemos();
      result.scanned = files.length;

      for (const filePath of files) {
        const filename = path.basename(filePath);
        if (this.matches.findBySourceFilename(filename)) {
          result.skipped.push({ file: filename, reason: "already imported" });
          continue;
        }

        const first = this.storage.stat(filePath);
        if (!first?.isFile()) {
          result.skipped.push({ file: filename, reason: "not a regular file" });
          continue;
        }

        await sleep(this.stableCheckSeconds * 1000);

        const second = this.storage.stat(filePath);
        if (!second?.isFile()) {
          result.skipped.push({ file: filename, reason: "file disappeared before import" });
          continue;
        }

        if (first.size !== second.size || second.size === 0) {
          result.skipped.push({ file: filename, reason: "file is still changing or empty" });
          continue;
        }

        const moved = this.storage.moveInboxDemoToRaw(filePath);
        if (this.matches.findByRawPath(moved.rawFilePath)) {
          result.skipped.push({ file: filename, reason: "already imported" });
          continue;
        }

        const matchId = this.matches.createQueued(moved);
        this.jobs.createQueued(matchId, moved.rawFilePath);
        result.imported += 1;
      }

      return result;
    } finally {
      this.inFlight = false;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
