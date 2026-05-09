import path from "node:path";
import { loadConfig } from "./config";
import { buildDashboard } from "./parser/buildDashboard";
import { runClarityDump } from "./parser/runClarity";
import { getNextQueuedJob, markJobDone, markJobFailed, markJobRunning, openDatabase, persistDashboardData } from "./db";

const config = loadConfig();
const db = openDatabase(config);

console.log("[worker] parser worker started");

async function tick(): Promise<void> {
  const job = getNextQueuedJob(db);
  if (!job) {
    return;
  }

  markJobRunning(db, job);
  const outputDir = path.join(config.parsedPath, String(job.matchId));
  console.log(`[worker] parsing job ${job.id}: ${job.rawFilePath}`);

  try {
    await runClarityDump(config, job.rawFilePath, outputDir, job.id);
    const parsed = buildDashboard(outputDir);
    persistDashboardData(db, job.matchId, outputDir);
    markJobDone(db, job, parsed);
    console.log(`[worker] job ${job.id} ready`);
  } catch (error) {
    markJobFailed(db, job, error);
    console.error(`[worker] job ${job.id} failed`, error);
  }
}

await tick();
setInterval(() => {
  tick().catch((error) => console.error("[worker] tick failed", error));
}, 3000).unref();

process.stdin.resume();
