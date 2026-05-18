import type { FastifyInstance } from "fastify";
import type { AdminPreHandler } from "../auth/adminAuth";
import type { JobsRepository } from "../repositories/jobsRepository";
import type { MatchesRepository } from "../repositories/matchesRepository";
import type { StorageService } from "../services/storageService";

export function registerMatchRoutes(
  app: FastifyInstance,
  matches: MatchesRepository,
  jobs: JobsRepository,
  storage: StorageService,
  requireAdmin: AdminPreHandler
): void {
  app.get("/api/matches", async () => ({
    matches: matches.list()
  }));

  app.get<{ Params: { id: string } }>("/api/matches/:id", async (request, reply) => {
    const match = matches.findById(Number(request.params.id));
    if (!match) {
      return reply.code(404).send({ error: "Match not found" });
    }
    return { match, latestJob: jobs.findLatestForMatch(match.id) };
  });

  app.get<{ Params: { id: string } }>("/api/matches/:id/jobs", { preHandler: requireAdmin }, async (request, reply) => {
    const match = matches.findById(Number(request.params.id));
    if (!match) {
      return reply.code(404).send({ error: "Match not found" });
    }

    return {
      latestJob: jobs.findLatestForMatch(match.id)
    };
  });

  app.get<{ Params: { id: string } }>("/api/matches/:id/dashboard", async (request, reply) => {
    const match = matches.findById(Number(request.params.id));
    if (!match) {
      return reply.code(404).send({ error: "Match not found" });
    }

    const dashboard = storage.readDashboard(match.id);
    if (!dashboard) {
      return reply.code(404).send({ error: "Dashboard data is not ready" });
    }

    return dashboard;
  });

  app.get("/api/jobs", { preHandler: requireAdmin }, async () => ({
    jobs: jobs.listRecent()
  }));

  app.get<{ Params: { id: string } }>("/api/jobs/:id/log", { preHandler: requireAdmin }, async (request, reply) => {
    const job = jobs.findById(Number(request.params.id));
    if (!job) {
      return reply.code(404).send({ error: "Job not found" });
    }

    return {
      jobId: job.id,
      ...storage.readParserLog(job.id)
    };
  });

  app.post<{ Params: { id: string } }>("/api/jobs/:id/retry", { preHandler: requireAdmin }, async (request, reply) => {
    const job = jobs.findById(Number(request.params.id));
    if (!job) {
      return reply.code(404).send({ error: "Job not found" });
    }

    const match = matches.findById(job.matchId);
    if (!match?.rawFilePath || !match.hasRawDemo) {
      return reply.code(404).send({ error: "Raw replay is not available for retry" });
    }
    await storage.restoreRawFile(match.rawFilePath, match.rawStorageKey);
    if (!storage.hasLocalRawFile(match.rawFilePath)) {
      return reply.code(409).send({ error: "Raw replay is remote-only and could not be restored for retry" });
    }

    const activeJob = jobs.findActiveForMatch(match.id);
    if (activeJob) {
      return { ok: true, jobId: activeJob.id, alreadyQueued: true };
    }

    storage.deleteParsedData(match.id);
    matches.markQueued(match.id);
    const jobId = jobs.createQueued(match.id, match.rawFilePath);
    return { ok: true, jobId };
  });

  app.delete<{ Params: { id: string } }>("/api/matches/:id", { preHandler: requireAdmin }, async (request, reply) => {
    const match = matches.findById(Number(request.params.id));
    if (!match) {
      return reply.code(404).send({ error: "Match not found" });
    }
    await storage.deleteRawFile(match.rawFilePath, match.rawStorageKey);
    storage.deleteParsedData(match.id);
    matches.markDeleted(match.id);
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>("/api/matches/:id/reparse", { preHandler: requireAdmin }, async (request, reply) => {
    const match = matches.findById(Number(request.params.id));
    if (!match?.rawFilePath || !match.hasRawDemo) {
      return reply.code(404).send({ error: "Raw replay is not available for reparsing" });
    }
    await storage.restoreRawFile(match.rawFilePath, match.rawStorageKey);
    if (!storage.hasLocalRawFile(match.rawFilePath)) {
      return reply.code(409).send({ error: "Raw replay is remote-only and could not be restored for reparsing" });
    }
    const activeJob = jobs.findActiveForMatch(match.id);
    if (activeJob) {
      return { ok: true, jobId: activeJob.id, alreadyQueued: true };
    }

    storage.deleteParsedData(match.id);
    matches.markQueued(match.id);
    const jobId = jobs.createQueued(match.id, match.rawFilePath);
    return { ok: true, jobId };
  });

  app.delete<{ Params: { id: string } }>("/api/matches/:id/raw", { preHandler: requireAdmin }, async (request, reply) => {
    const match = matches.findById(Number(request.params.id));
    if (!match) {
      return reply.code(404).send({ error: "Match not found" });
    }
    if (!match.rawFilePath || !match.hasRawDemo) {
      return reply.code(404).send({ error: "Raw replay is already missing" });
    }

    await storage.deleteRawFile(match.rawFilePath, match.rawStorageKey);
    matches.markRawDeleted(match.id, "manual");
    return { ok: true };
  });

  app.get<{ Params: { id: string } }>("/api/matches/:id/download", async (request, reply) => {
    const match = matches.findById(Number(request.params.id));
    if (!match?.rawFilePath) {
      return reply.code(404).send({ error: "Replay file not found" });
    }

    const stat = storage.localRawStat(match.rawFilePath);
    reply.header("Content-Disposition", `attachment; filename="${safeDownloadName(match.matchId, match.sourceFilename)}"`);
    if (stat && match.rawFilePath) {
      reply.header("Content-Type", "application/octet-stream");
      reply.header("Content-Length", stat.size);
      return reply.send(storage.createLocalRawStream(match.rawFilePath));
    }

    if (match.rawStorageKey) {
      const url = storage.createRemoteDownloadUrl(match.rawStorageKey, safeDownloadName(match.matchId, match.sourceFilename));
      if (url) {
        return reply.redirect(url);
      }
    }

    return reply.code(404).send({ error: "Replay file not available" });
  });
}

function safeDownloadName(matchId: string | null, fallback: string): string {
  const base = (matchId || fallback.replace(/\.dem$/i, "") || "replay").replace(/[^a-zA-Z0-9._-]+/g, "_");
  return `${base}.dem`;
}
