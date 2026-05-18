import fs from "node:fs";
import path from "node:path";
import { S3ObjectStorage } from "@dota-replay/shared/storage/s3ObjectStorage";
import { loadConfig } from "./config";
import { buildDashboard } from "./parser/buildDashboard";
import { runClarityDump } from "./parser/runClarity";
import { findExistingMatchByParsedId, getNextQueuedJob, markJobDone, markJobDuplicate, markJobFailed, markJobRunning, openDatabase, persistDashboardData, resetInterruptedRunningJobs } from "./db";

const config = loadConfig();
const db = openDatabase(config);
const remoteRawStorage = config.replayStorage.driver === "s3" ? new S3ObjectStorage(config.replayStorage.s3) : null;
const resetCount = resetInterruptedRunningJobs(db);

console.log("[worker] parser worker started");
if (resetCount > 0) {
  console.log(`[worker] reset ${resetCount} interrupted running job(s)`);
}

let isParsing = false;

async function tick(): Promise<void> {
  if (isParsing) {
    return;
  }

  const job = getNextQueuedJob(db);
  if (!job) {
    return;
  }

  isParsing = true;
  markJobRunning(db, job);
  const outputDir = path.join(config.parsedPath, String(job.matchId));
  console.log(`[worker] parsing job ${job.id}: ${job.rawFilePath}`);

  try {
    await ensureRawFile(job);
    await runClarityDump(config, job.rawFilePath, outputDir, job.id);
    const parsed = buildDashboard(outputDir);
    const existingMatch = findExistingMatchByParsedId(db, parsed.matchId, job.matchId);
    if (existingMatch && parsed.matchId) {
      markJobDuplicate(db, job, parsed.matchId, existingMatch.id);
      console.log(`[worker] job ${job.id} duplicate of match row ${existingMatch.id}`);
      return;
    }
    persistDashboardData(db, job.matchId, outputDir);
    markJobDone(db, job, parsed);
    console.log(`[worker] job ${job.id} ready`);
  } catch (error) {
    markJobFailed(db, job, error);
    console.error(`[worker] job ${job.id} failed`, error);
  } finally {
    cleanupRemoteTemp(job);
    isParsing = false;
  }
}

await tick();
setInterval(() => {
  tick().catch((error) => console.error("[worker] tick failed", error));
}, 3000);

async function ensureRawFile(job: { rawFilePath: string; rawStorageKey: string | null }): Promise<void> {
  if (fs.existsSync(job.rawFilePath)) {
    return;
  }
  if (!job.rawStorageKey || !remoteRawStorage) {
    throw new Error(`Raw replay is missing locally and no S3 object is available: ${job.rawFilePath}`);
  }

  console.log(`[worker] downloading remote replay ${job.rawStorageKey}`);
  await remoteRawStorage.downloadToFile(job.rawStorageKey, job.rawFilePath);
}

function cleanupRemoteTemp(job: { rawFilePath: string; rawStorageKey: string | null }): void {
  if (!job.rawStorageKey) {
    return;
  }

  const tempRoot = path.resolve(config.tempDemoPath);
  const resolved = path.resolve(job.rawFilePath);
  if ((resolved === tempRoot || resolved.startsWith(`${tempRoot}${path.sep}`)) && fs.existsSync(resolved)) {
    fs.unlinkSync(resolved);
  }
}
