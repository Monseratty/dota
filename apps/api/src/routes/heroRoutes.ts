import type { FastifyInstance } from "fastify";
import type { HeroAnalyticsService } from "../services/heroAnalyticsService";

export function registerHeroRoutes(app: FastifyInstance, heroAnalytics: HeroAnalyticsService): void {
  app.get("/api/heroes/stats", async () => ({
    stats: heroAnalytics.buildHeroIndexStats()
  }));

  app.get<{ Params: { heroKey: string } }>("/api/heroes/:heroKey/stats", async (request) => ({
    stats: heroAnalytics.buildHeroStats(request.params.heroKey)
  }));

  app.get<{ Params: { heroKey: string } }>("/api/heroes/:heroKey/analytics", async (request) => ({
    analytics: heroAnalytics.buildHeroAnalytics(request.params.heroKey)
  }));
}
