import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { S3ObjectStorage } from "../packages/shared/src/storage/s3ObjectStorage.ts";

const sizeBytes = Number(process.argv[2] || 25_000_000);
if (!Number.isInteger(sizeBytes) || sizeBytes <= 0) {
  throw new Error("Usage: tsx scripts/measure-s3-speed.mjs <positive-size-bytes>");
}

const required = [
  "S3_ENDPOINT",
  "S3_REGION",
  "S3_BUCKET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY"
];
for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing ${key}`);
  }
}

const storage = new S3ObjectStorage({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION,
  bucket: process.env.S3_BUCKET,
  accessKeyId: process.env.S3_ACCESS_KEY_ID,
  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  forcePathStyle: parseBoolean(process.env.S3_FORCE_PATH_STYLE, true),
  uploadPrefix: process.env.S3_UPLOAD_PREFIX || "raw",
  directUploadPrefix: process.env.S3_DIRECT_UPLOAD_PREFIX || "incoming",
  presignedUrlTtlSeconds: Number(process.env.S3_PRESIGNED_URL_TTL_SECONDS || 900)
});

const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const uploadPath = path.join(os.tmpdir(), `dota-s3-speed-${id}.bin`);
const downloadPath = path.join(os.tmpdir(), `dota-s3-speed-${id}.download.bin`);
const key = `speed-test/${id}.bin`;

try {
  fs.closeSync(fs.openSync(uploadPath, "w"));
  fs.truncateSync(uploadPath, sizeBytes);

  const uploadStarted = process.hrtime.bigint();
  await storage.putFile(uploadPath, key);
  const uploadSeconds = secondsSince(uploadStarted);

  const downloadStarted = process.hrtime.bigint();
  await storage.downloadToFile(key, downloadPath);
  const downloadSeconds = secondsSince(downloadStarted);

  const downloadedBytes = fs.statSync(downloadPath).size;
  console.log(JSON.stringify({
    sizeBytes,
    uploadSeconds,
    uploadMbps: mbps(sizeBytes, uploadSeconds),
    downloadSeconds,
    downloadMbps: mbps(downloadedBytes, downloadSeconds)
  }));
} finally {
  try {
    await storage.deleteObject(key);
  } catch {
    // Best effort cleanup only.
  }
  for (const filePath of [uploadPath, downloadPath]) {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}

function secondsSince(startedAt) {
  return Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
}

function mbps(bytes, seconds) {
  return Number(((bytes * 8) / seconds / 1_000_000).toFixed(2));
}

function parseBoolean(value, fallback) {
  if (!value) {
    return fallback;
  }
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}
