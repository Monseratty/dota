import type { FastifyInstance } from "fastify";
import type { HeroAnalyticsService } from "../services/heroAnalyticsService";

export function registerHeroRoutes(app: FastifyInstance, heroAnalytics: HeroAnalyticsService): void {
  app.get<{ Params: { heroKey: string } }>("/api/heroes/:heroKey/analytics", async (request) => ({
    analytics: heroAnalytics.buildHeroAnalytics(request.params.heroKey)
  }));
}
