import type { FastifyInstance } from "fastify";
import type { AdminPreHandler } from "../auth/adminAuth";
import type { StorageService } from "../services/storageService";
import type { WatchFolderScanner } from "../scanner/watchFolderScanner";

export function registerSystemRoutes(
  app: FastifyInstance,
  storage: StorageService,
  scanner: WatchFolderScanner,
  requireAdmin: AdminPreHandler
): void {
  app.get("/api/health", async () => ({
    ok: true,
    service: "dota-replay-api",
    time: new Date().toISOString()
  }));

  app.get("/api/system/storage", { preHandler: requireAdmin }, async () => storage.storageInfo());

  app.post("/api/system/rescan", { preHandler: requireAdmin }, async () => scanner.scan());
}
