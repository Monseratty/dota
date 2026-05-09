import Fastify from "fastify";
import cors from "@fastify/cors";
import { RawDemoCleanup } from "./cleanup/rawDemoCleanup";
import { ensureConfiguredFolders, loadConfig } from "./config/appConfig";
import { openDatabase } from "./db/database";
import { JobsRepository } from "./repositories/jobsRepository";
import { MatchesRepository } from "./repositories/matchesRepository";
import { registerMatchRoutes } from "./routes/matchRoutes";
import { registerSystemRoutes } from "./routes/systemRoutes";
import { WatchFolderScanner } from "./scanner/watchFolderScanner";
import { StorageService } from "./services/storageService";

const config = loadConfig();
ensureConfiguredFolders(config);

const db = openDatabase(config);
const storage = new StorageService(config);
const matches = new MatchesRepository(db, (id) => storage.hasDashboard(id));
const jobs = new JobsRepository(db);
const scanner = new WatchFolderScanner(storage, matches, jobs, config.fileStableCheckSeconds);
const rawDemoCleanup = new RawDemoCleanup(config, matches, storage);

const app = Fastify({
  logger: {
    level: "info"
  }
});

await app.register(cors, {
  origin: true
});

registerSystemRoutes(app, storage, scanner);
registerMatchRoutes(app, matches, jobs, storage);

scanner.start(config.scanIntervalSeconds);
rawDemoCleanup.start();

await app.listen({
  host: "0.0.0.0",
  port: config.apiPort
});
