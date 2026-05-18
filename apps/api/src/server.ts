import Fastify from "fastify";
import cors from "@fastify/cors";
import { createAdminAuth, registerAdminAuthRoutes } from "./auth/adminAuth";
import { RawDemoCleanup } from "./cleanup/rawDemoCleanup";
import { ensureConfiguredFolders, loadConfig } from "./config/appConfig";
import { openDatabase } from "./db/database";
import { JobsRepository } from "./repositories/jobsRepository";
import { MatchesRepository } from "./repositories/matchesRepository";
import { registerHeroRoutes } from "./routes/heroRoutes";
import { registerMatchRoutes } from "./routes/matchRoutes";
import { registerSystemRoutes } from "./routes/systemRoutes";
import { registerUploadRoutes } from "./routes/uploadRoutes";
import { WatchFolderScanner } from "./scanner/watchFolderScanner";
import { HeroAnalyticsService } from "./services/heroAnalyticsService";
import { StorageService } from "./services/storageService";

const config = loadConfig();
ensureConfiguredFolders(config);

const db = openDatabase(config);
const storage = new StorageService(config);
const matches = new MatchesRepository(db, (id) => storage.hasDashboard(id));
const jobs = new JobsRepository(db);
const heroAnalytics = new HeroAnalyticsService(matches, storage);
const scanner = new WatchFolderScanner(storage, matches, jobs, config.fileStableCheckSeconds);
const rawDemoCleanup = new RawDemoCleanup(config, matches, storage);
const adminAuth = createAdminAuth();

const app = Fastify({
  logger: {
    level: "info"
  }
});

await app.register(cors, {
  origin: true,
  credentials: true
});

registerAdminAuthRoutes(app, adminAuth);
registerSystemRoutes(app, storage, scanner, adminAuth.requireAdmin);
registerHeroRoutes(app, heroAnalytics);
registerMatchRoutes(app, matches, jobs, storage, adminAuth.requireAdmin);
registerUploadRoutes(app, matches, jobs, storage, adminAuth.requireAdmin);

scanner.start(config.scanIntervalSeconds);
rawDemoCleanup.start();

await app.listen({
  host: "0.0.0.0",
  port: config.apiPort
});
