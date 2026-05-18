import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AdminPreHandler } from "../auth/adminAuth";
import type { JobsRepository } from "../repositories/jobsRepository";
import type { MatchesRepository } from "../repositories/matchesRepository";
import type { StorageService } from "../services/storageService";

const presignSchema = z.object({
  filename: z.string().min(1),
  fileSize: z.number().int().positive().optional()
});

const completeSchema = z.object({
  uploadId: z.string().min(12),
  key: z.string().min(1),
  filename: z.string().min(1),
  fileSize: z.number().int().positive()
});

export function registerUploadRoutes(
  app: FastifyInstance,
  matches: MatchesRepository,
  jobs: JobsRepository,
  storage: StorageService,
  requireAdmin: AdminPreHandler
): void {
  app.post("/api/uploads/replays/presign", { preHandler: requireAdmin }, async (request, reply) => {
    const parsed = presignSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid upload request" });
    }

    if (!parsed.data.filename.toLowerCase().endsWith(".dem")) {
      return reply.code(400).send({ error: "Only .dem files can be uploaded" });
    }

    try {
      return storage.createRemoteUpload(parsed.data.filename);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(409).send({ error: message });
    }
  });

  app.post("/api/uploads/replays/complete", { preHandler: requireAdmin }, async (request, reply) => {
    const parsed = completeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid upload completion request" });
    }

    const { uploadId, key, filename, fileSize } = parsed.data;
    if (!filename.toLowerCase().endsWith(".dem") || !key.endsWith(".dem") || !key.includes(uploadId)) {
      return reply.code(400).send({ error: "Upload key does not match this replay upload" });
    }

    const rawFilePath = storage.tempRawFilePath(uploadId, filename);
    const matchId = matches.createQueued({
      sourceFilename: filename,
      rawFilePath,
      fileSize,
      rawStorageDriver: "s3",
      rawStorageKey: key,
      rawUploadedAt: new Date().toISOString()
    });
    const jobId = jobs.createQueued(matchId, rawFilePath);
    const match = matches.findById(matchId);

    return {
      ok: true,
      match,
      jobId
    };
  });
}
