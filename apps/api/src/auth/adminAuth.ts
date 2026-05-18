import crypto from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

const COOKIE_NAME = "dota_admin";
const DEFAULT_TTL_SECONDS = 60 * 60 * 8;

const loginSchema = z.object({
  password: z.string().min(1)
});

export type AdminPreHandler = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

export interface AdminAuth {
  isConfigured: boolean;
  requireAdmin: AdminPreHandler;
}

interface AdminAuthOptions {
  password: string | undefined;
  sessionSecret: string | undefined;
  ttlSeconds: number;
  cookieSecure: boolean;
}

export function createAdminAuth(): AdminAuth {
  const options: AdminAuthOptions = {
    password: process.env.ADMIN_PASSWORD,
    sessionSecret: process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD,
    ttlSeconds: parsePositiveInt(process.env.ADMIN_SESSION_TTL_SECONDS, DEFAULT_TTL_SECONDS),
    cookieSecure: parseBoolean(process.env.ADMIN_COOKIE_SECURE, false)
  };

  const isConfigured = Boolean(options.password && options.sessionSecret);

  return {
    isConfigured,
    requireAdmin: async (request, reply) => {
      if (!isConfigured) {
        reply.code(503).send({ error: "Admin auth is not configured" });
        return;
      }
      if (!verifyToken(readCookie(request.headers.cookie, COOKIE_NAME), options)) {
        reply.code(401).send({ error: "Admin session required" });
      }
    }
  };
}

export function registerAdminAuthRoutes(app: FastifyInstance, auth: AdminAuth): void {
  app.get("/api/admin/session", async (request) => ({
    configured: auth.isConfigured,
    authenticated: auth.isConfigured && verifyToken(readCookie(request.headers.cookie, COOKIE_NAME), authOptionsFromEnv())
  }));

  app.post("/api/admin/login", async (request, reply) => {
    const options = authOptionsFromEnv();
    if (!auth.isConfigured || !options.password || !options.sessionSecret) {
      return reply.code(503).send({ error: "Admin auth is not configured" });
    }

    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success || !safeEqualText(parsed.data.password, options.password)) {
      return reply.code(401).send({ error: "Invalid admin password" });
    }

    setCookie(reply, COOKIE_NAME, createToken(options), options);
    reply.header("Cache-Control", "no-store");
    return { ok: true };
  });

  app.post("/api/admin/logout", async (_request, reply) => {
    clearCookie(reply, COOKIE_NAME);
    reply.header("Cache-Control", "no-store");
    return { ok: true };
  });
}

function authOptionsFromEnv(): AdminAuthOptions {
  return {
    password: process.env.ADMIN_PASSWORD,
    sessionSecret: process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD,
    ttlSeconds: parsePositiveInt(process.env.ADMIN_SESSION_TTL_SECONDS, DEFAULT_TTL_SECONDS),
    cookieSecure: parseBoolean(process.env.ADMIN_COOKIE_SECURE, false)
  };
}

function createToken(options: AdminAuthOptions): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = base64UrlEncode(JSON.stringify({
    iat: now,
    exp: now + options.ttlSeconds,
    nonce: crypto.randomBytes(16).toString("hex")
  }));
  return `${payload}.${sign(payload, options.sessionSecret || "")}`;
}

function verifyToken(token: string | null, options: AdminAuthOptions): boolean {
  if (!token || !options.sessionSecret) {
    return false;
  }

  const [payload, signature] = token.split(".");
  if (!payload || !signature || !safeEqualText(signature, sign(payload, options.sessionSecret))) {
    return false;
  }

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { exp?: number };
    return Number(data.exp) > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

function sign(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEqualText(left: string, right: string): boolean {
  const leftHash = crypto.createHash("sha256").update(left).digest();
  const rightHash = crypto.createHash("sha256").update(right).digest();
  return crypto.timingSafeEqual(leftHash, rightHash);
}

function setCookie(reply: FastifyReply, name: string, value: string, options: AdminAuthOptions): void {
  const parts = [
    `${name}=${value}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${options.ttlSeconds}`
  ];
  if (options.cookieSecure) {
    parts.push("Secure");
  }
  reply.header("Set-Cookie", parts.join("; "));
}

function clearCookie(reply: FastifyReply, name: string): void {
  reply.header("Set-Cookie", `${name}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

function readCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) {
    return null;
  }
  const prefix = `${name}=`;
  for (const rawPart of cookieHeader.split(";")) {
    const part = rawPart.trim();
    if (part.startsWith(prefix)) {
      return part.slice(prefix.length);
    }
  }
  return null;
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) {
    return fallback;
  }
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
