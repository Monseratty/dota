import { useEffect, useMemo } from "react";
import { BlackHole } from "./BlackHole";
import { useGravity } from "./useGravity";
import { useParticles } from "./useParticles";

/**
 * CosmicBackdrop — one-line drop-in.
 *
 *   <CosmicBackdrop />
 *
 * Renders the black hole + inflow + crosshairs and installs the two effects
 * (gravity on [data-suck] elements, falling particles). Place it once at the
 * page root.
 *
 * If the BH lives somewhere other than the top-right corner, pass
 * `getCenter` (e.g. `() => ({ x: 200, y: 200 })`).
 */
export interface CosmicBackdropProps {
  /** Override BH center used by gravity + particles. */
  getCenter?: () => { x: number; y: number };
  /** Hide the corner crosshair labels. */
  hideCrosshairs?: boolean;
  /** Route camera preset. Keeps one black hole, but changes the viewing angle. */
  scene?: CosmicScene;
}

export type CosmicScene = "matches" | "match" | "heroes" | "hero";

const scenePositions: Record<CosmicScene, { right: number; top: number }> = {
  matches: { right: -320, top: -360 },
  match: { right: -80, top: -430 },
  heroes: { right: 160, top: -300 },
  hero: { right: 60, top: -220 }
};

function centerFromScene(scene: CosmicScene) {
  return () => {
    const position = scenePositions[scene];
    return {
      x: window.innerWidth - position.right - 540,
      y: position.top + 540
    };
  };
}

export function CosmicBackdrop({ getCenter, hideCrosshairs, scene = "matches" }: CosmicBackdropProps = {}) {
  const sceneCenter = useMemo(() => centerFromScene(scene), [scene]);
  const resolvedCenter = getCenter ?? sceneCenter;

  useGravity({ getCenter: resolvedCenter, maxElements: 48 });
  useParticles({ getCenter: resolvedCenter, intervalMs: 950, spawnChance: 0.32, maxLive: 18 });

  useEffect(() => {
    // CSS uses this attribute for the camera preset: same scene, different orbit angle.
    document.documentElement.dataset.cosmicScene = scene;
    return () => {
      if (document.documentElement.dataset.cosmicScene === scene) {
        delete document.documentElement.dataset.cosmicScene;
      }
    };
  }, [scene]);

  return (
    <>
      <BlackHole />
      {!hideCrosshairs ? (
        <>
          <div className="crosshair tl" aria-hidden="true">52°N · 13°E · 00.00.00</div>
          <div className="crosshair br" aria-hidden="true">DOTA·REPLAY / v0.1.0</div>
        </>
      ) : null}
    </>
  );
}
