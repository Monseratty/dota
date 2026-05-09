import fs from "node:fs";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import type { JobsRepository } from "../repositories/jobsRepository";
import type { MatchesRepository } from "../repositories/matchesRepository";
import type { StorageService } from "../services/storageService";

export function registerMatchRoutes(
  app: FastifyInstance,
  matches: MatchesRepository,
  jobs: JobsRepository,
  storage: StorageService
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

  app.get<{ Params: { id: string } }>("/api/matches/:id/jobs", async (request, reply) => {
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

  app.get("/api/jobs", async () => ({
    jobs: jobs.listRecent()
  }));

  app.delete<{ Params: { id: string } }>("/api/matches/:id", async (request, reply) => {
    const match = matches.findById(Number(request.params.id));
    if (!match) {
      return reply.code(404).send({ error: "Match not found" });
    }
    storage.deleteRawFile(match.rawFilePath);
    storage.deleteParsedData(match.id);
    matches.markDeleted(match.id);
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>("/api/matches/:id/reparse", async (request, reply) => {
    const match = matches.findById(Number(request.params.id));
    if (!match?.rawFilePath || !match.hasRawDemo) {
      return reply.code(404).send({ error: "Raw replay is not available for reparsing" });
    }
    storage.deleteParsedData(match.id);
    matches.markQueued(match.id);
    const jobId = jobs.createQueued(match.id, match.rawFilePath);
    return { ok: true, jobId };
  });

  app.get<{ Params: { id: string } }>("/api/matches/:id/download", async (request, reply) => {
    const match = matches.findById(Number(request.params.id));
    if (!match?.rawFilePath) {
      return reply.code(404).send({ error: "Replay file not found" });
    }

    const rawFilePath = path.resolve(match.rawFilePath);
    if (!storage.isInsideRawDemoPath(rawFilePath) || !fs.existsSync(rawFilePath)) {
      return reply.code(404).send({ error: "Replay file not available" });
    }

    const stat = fs.statSync(rawFilePath);
    reply.header("Content-Type", "application/octet-stream");
    reply.header("Content-Length", stat.size);
    reply.header("Content-Disposition", `attachment; filename="${safeDownloadName(match.matchId, match.sourceFilename)}"`);
    return reply.send(fs.createReadStream(rawFilePath));
  });
}

function safeDownloadName(matchId: string | null, fallback: string): string {
  const base = (matchId || fallback.replace(/\.dem$/i, "") || "replay").replace(/[^a-zA-Z0-9._-]+/g, "_");
  return `${base}.dem`;
}
