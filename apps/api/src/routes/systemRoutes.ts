import type { FastifyInstance } from "fastify";
import type { StorageService } from "../services/storageService";
import type { WatchFolderScanner } from "../scanner/watchFolderScanner";

export function registerSystemRoutes(app: FastifyInstance, storage: StorageService, scanner: WatchFolderScanner): void {
  app.get("/api/health", async () => ({
    ok: true,
    service: "dota-replay-api",
    time: new Date().toISOString()
  }));

  app.get("/api/system/storage", async () => storage.storageInfo());

  app.post("/api/system/rescan", async () => scanner.scan());
}
