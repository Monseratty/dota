import type { AppConfig } from "../config/appConfig";
import type { MatchesRepository } from "../repositories/matchesRepository";
import type { StorageService } from "../services/storageService";

export class RawDemoCleanup {
  constructor(
    private readonly config: AppConfig,
    private readonly matches: MatchesRepository,
    private readonly storage: StorageService
  ) {}

  start(): void {
    if (this.config.keepRawDemos || !this.config.autoDeleteRawAfterDays) {
      return;
    }

    void this.run();
    setInterval(() => {
      void this.run();
    }, 60 * 60 * 1000).unref();
  }

  async run(): Promise<{ deleted: number }> {
    if (this.config.keepRawDemos || !this.config.autoDeleteRawAfterDays) {
      return { deleted: 0 };
    }

    const cutoff = new Date(Date.now() - this.config.autoDeleteRawAfterDays * 24 * 60 * 60 * 1000);
    const candidates = this.matches.listRawCleanupCandidates(cutoff);
    let deleted = 0;

    for (const match of candidates) {
      await this.storage.deleteRawFile(match.rawFilePath, match.rawStorageKey);
      this.matches.markRawDeleted(match.id, `auto:${this.config.autoDeleteRawAfterDays}d`);
      deleted += 1;
    }

    return { deleted };
  }
}
