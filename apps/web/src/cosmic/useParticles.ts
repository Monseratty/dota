import { useEffect } from "react";

/**
 * useParticles
 * ------------
 * Spawns short-lived DOM nodes (.particle) that ride a curved CSS `offset-path`
 * from a random screen edge into a random point on the BH event horizon.
 *
 * Each particle gets a unique quadratic-Bezier path so the streams never look
 * synchronized; durations are randomized between 3.8 and 6.8 s for a calm,
 * chill flow rather than a frantic siphon.
 *
 * The `particle-pull` keyframe (in cosmic.css) animates `offset-distance` from
 * 0% → 100% and tweens opacity/scale for the fade-in / scale-up / vanish.
 */
export interface ParticleOptions {
  getCenter?: () => { x: number; y: number };
  /** Visible event horizon radius in CSS px. Default 160. */
  horizonRadius?: number;
  /** Spawn interval in ms (probabilistic). Default 280. */
  intervalMs?: number;
  /** 0..1 chance of spawning on each tick. Default 0.85. */
  spawnChance?: number;
  /** Hard cap for live particle DOM nodes. Default 18. */
  maxLive?: number;
}

const defaultCenter = () => ({ x: window.innerWidth - 220, y: 180 });

const KINDS = ["", "warm", "cold", "dust", "dust", ""];

export function useParticles(options: ParticleOptions = {}) {
  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const smallViewport = window.innerWidth < 900;
    const lowPowerCpu = typeof navigator.hardwareConcurrency === "number" && navigator.hardwareConcurrency <= 4;
    if (reducedMotion || smallViewport || lowPowerCpu) {
      return;
    }

    const getCenter = options.getCenter ?? defaultCenter;
    const EVENT_HORIZON = options.horizonRadius ?? 160;
    const intervalMs = options.intervalMs ?? 950;
    const spawnChance = options.spawnChance ?? 0.32;
    const maxLive = options.maxLive ?? 18;

    const live: Array<{ el: HTMLSpanElement; timer: number }> = [];

    function spawn() {
      if (document.hidden) return;
      if (live.length >= maxLive) return;
      const c = getCenter();

      const edgeBias = Math.random();
      let sx: number;
      let sy: number;
      if (edgeBias < 0.65) {
        const edge = Math.floor(Math.random() * 4);
        if (edge === 0)      { sx = Math.random() * window.innerWidth; sy = -10; }
        else if (edge === 1) { sx = window.innerWidth + 10; sy = Math.random() * window.innerHeight; }
        else if (edge === 2) { sx = Math.random() * window.innerWidth; sy = window.innerHeight + 10; }
        else                 { sx = -10; sy = Math.random() * window.innerHeight; }
      } else {
        sx = Math.random() * window.innerWidth;
        sy = Math.random() * window.innerHeight;
      }

      const initialDist = Math.hypot(c.x - sx, c.y - sy);
      if (initialDist < EVENT_HORIZON + 40) return;

      const endAngle = Math.random() * Math.PI * 2;
      const endRadius = EVENT_HORIZON * (0.55 + Math.random() * 0.45);
      const endX = c.x + Math.cos(endAngle) * endRadius;
      const endY = c.y + Math.sin(endAngle) * endRadius;

      const dx = endX - sx;
      const dy = endY - sy;

      const lineAngle = Math.atan2(dy, dx);
      const curveAmount = (Math.random() - 0.5) * 320;
      const perpX = -Math.sin(lineAngle) * curveAmount;
      const perpY = Math.cos(lineAngle) * curveAmount;
      const ctrlX = dx / 2 + perpX;
      const ctrlY = dy / 2 + perpY;

      const el = document.createElement("span");
      const kind = KINDS[Math.floor(Math.random() * KINDS.length)];
      el.className = "particle" + (kind ? " " + kind : "");
      const dur = 3800 + Math.random() * 3000;

      el.style.left = sx + "px";
      el.style.top = sy + "px";
      // SVG-style path; offsetPath is supported in all modern browsers.
      el.style.offsetPath = `path("M 0 0 Q ${ctrlX.toFixed(0)} ${ctrlY.toFixed(0)}, ${dx.toFixed(0)} ${dy.toFixed(0)}")`;
      el.style.setProperty("--dur", dur + "ms");

      document.body.appendChild(el);
      const timer = window.setTimeout(() => {
        el.remove();
        const idx = live.findIndex((p) => p.el === el);
        if (idx !== -1) live.splice(idx, 1);
      }, dur + 200);
      live.push({ el, timer });
    }

    const id = window.setInterval(() => {
      if (Math.random() < spawnChance) spawn();
    }, intervalMs);

    return () => {
      window.clearInterval(id);
      live.forEach(({ el, timer }) => {
        window.clearTimeout(timer);
        el.remove();
      });
    };
  }, [options.getCenter, options.horizonRadius, options.intervalMs, options.maxLive, options.spawnChance]);
}
