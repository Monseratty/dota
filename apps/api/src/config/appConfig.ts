import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

const configSchema = z.object({
  storagePath: z.string(),
  inboxPath: z.string(),
  rawDemoPath: z.string(),
  parsedPath: z.string(),
  failedPath: z.string(),
  parserLogPath: z.string(),
  databasePath: z.string(),
  scanIntervalSeconds: z.number().int().positive(),
  fileStableCheckSeconds: z.number().int().positive(),
  parserConcurrency: z.number().int().positive(),
  keepRawDemos: z.boolean(),
  autoDeleteRawAfterDays: z.number().int().positive().nullable(),
  apiPort: z.number().int().positive(),
  webPort: z.number().int().positive()
});

export type AppConfig = z.infer<typeof configSchema>;

export function loadConfig(): AppConfig {
  const configPath = findConfigPath(process.cwd());
  const rootPath = path.dirname(configPath);
  const raw = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const parsed = configSchema.parse(raw);

  return Object.fromEntries(
    Object.entries(parsed).map(([key, value]) => {
      if (typeof value === "string" && (key.endsWith("Path") || key === "databasePath")) {
        return [key, path.resolve(rootPath, value)];
      }
      return [key, value];
    })
  ) as AppConfig;
}

export function ensureConfiguredFolders(config: AppConfig): void {
  for (const folder of [
    config.storagePath,
    config.inboxPath,
    config.rawDemoPath,
    config.parsedPath,
    config.failedPath,
    config.parserLogPath,
    path.dirname(config.databasePath)
  ]) {
    fs.mkdirSync(folder, { recursive: true });
  }
}

function findConfigPath(startPath: string): string {
  let current = path.resolve(startPath);
  while (true) {
    const candidate = path.join(current, "config.json");
    if (fs.existsSync(candidate)) {
      return candidate;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error(`Could not find config.json from ${startPath}`);
    }
    current = parent;
  }
}
