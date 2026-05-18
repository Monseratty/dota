import fs from "node:fs";
import path from "node:path";
import type { S3ObjectStorageConfig } from "@dota-replay/shared/storage/s3ObjectStorage";
import { z } from "zod";

const replayStorageInputSchema = z.object({
  driver: z.enum(["local", "s3"]).optional(),
  s3: z.object({
    endpoint: z.string().optional(),
    region: z.string().optional(),
    bucket: z.string().optional(),
    accessKeyId: z.string().optional(),
    secretAccessKey: z.string().optional(),
    forcePathStyle: z.boolean().optional(),
    uploadPrefix: z.string().optional(),
    directUploadPrefix: z.string().optional(),
    presignedUrlTtlSeconds: z.number().int().positive().optional()
  }).nullable().optional()
}).optional();

const configSchema = z.object({
  storagePath: z.string(),
  inboxPath: z.string(),
  rawDemoPath: z.string(),
  tempDemoPath: z.string().optional(),
  parsedPath: z.string(),
  failedPath: z.string(),
  parserLogPath: z.string(),
  databasePath: z.string(),
  scanIntervalSeconds: z.number().int().positive(),
  fileStableCheckSeconds: z.number().int().positive(),
  parserConcurrency: z.number().int().positive(),
  keepRawDemos: z.boolean(),
  autoDeleteRawAfterDays: z.number().int().positive().nullable(),
  replayStorage: replayStorageInputSchema,
  apiPort: z.number().int().positive(),
  webPort: z.number().int().positive()
});

export type ReplayStorageConfig =
  | { driver: "local"; s3: null }
  | { driver: "s3"; s3: S3ObjectStorageConfig };

export type AppConfig = Omit<z.infer<typeof configSchema>, "replayStorage" | "tempDemoPath"> & {
  tempDemoPath: string;
  replayStorage: ReplayStorageConfig;
};

export function loadConfig(): AppConfig {
  const configPath = findConfigPath(process.cwd());
  const rootPath = path.dirname(configPath);
  const env = { ...loadDotEnv(path.join(rootPath, ".env")), ...process.env };
  const raw = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const parsed = configSchema.parse(raw);

  const resolved = Object.fromEntries(
    Object.entries(parsed).map(([key, value]) => {
      if (typeof value === "string" && (key.endsWith("Path") || key === "databasePath")) {
        return [key, path.resolve(rootPath, value)];
      }
      return [key, value];
    })
  ) as Omit<z.infer<typeof configSchema>, "replayStorage"> & {
    replayStorage?: z.infer<typeof replayStorageInputSchema>;
  };

  return {
    ...resolved,
    tempDemoPath: path.resolve(rootPath, parsed.tempDemoPath || path.join(parsed.storagePath, "tmp")),
    replayStorage: normalizeReplayStorage(parsed.replayStorage, env)
  };
}

export function projectRoot(): string {
  return path.dirname(findConfigPath(process.cwd()));
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

function normalizeReplayStorage(
  input: z.infer<typeof replayStorageInputSchema>,
  env: Record<string, string | undefined>
): ReplayStorageConfig {
  const driver = (env.STORAGE_DRIVER || input?.driver || "local").toLowerCase();
  if (driver !== "s3") {
    return { driver: "local", s3: null };
  }

  const s3 = input?.s3 || {};
  return {
    driver: "s3",
    s3: {
      endpoint: env.S3_ENDPOINT || s3.endpoint || "",
      region: env.S3_REGION || s3.region || "",
      bucket: env.S3_BUCKET || s3.bucket || "",
      accessKeyId: env.S3_ACCESS_KEY_ID || s3.accessKeyId || "",
      secretAccessKey: env.S3_SECRET_ACCESS_KEY || s3.secretAccessKey || "",
      forcePathStyle: parseBoolean(env.S3_FORCE_PATH_STYLE, s3.forcePathStyle ?? true),
      uploadPrefix: env.S3_UPLOAD_PREFIX || s3.uploadPrefix || "raw",
      directUploadPrefix: env.S3_DIRECT_UPLOAD_PREFIX || s3.directUploadPrefix || "incoming",
      presignedUrlTtlSeconds: parsePositiveInt(env.S3_PRESIGNED_URL_TTL_SECONDS, s3.presignedUrlTtlSeconds ?? 900)
    }
  };
}

function loadDotEnv(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const env: Record<string, string> = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const normalized = trimmed.startsWith("export ") ? trimmed.slice(7).trim() : trimmed;
    const equals = normalized.indexOf("=");
    if (equals === -1) {
      continue;
    }
    const key = normalized.slice(0, equals).trim();
    const value = normalized.slice(equals + 1).trim().replace(/^['"]|['"]$/g, "");
    env[key] = value;
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
  return env;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") {
    return fallback;
  }
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined || value === "") {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
