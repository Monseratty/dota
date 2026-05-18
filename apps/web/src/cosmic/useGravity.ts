import { useEffect } from "react";

/**
 * useGravity
 * ----------
 * Applies black-hole gravity to every `[data-suck]` element in the document.
 *
 * For each element we measure its center, compute the vector to the BH center,
 * and write four CSS custom properties on it:
 *   --g-tx       translateX (px)
 *   --g-ty       translateY (px)
 *   --g-skewx    skewX (deg)
 *   --g-skewy    skewY (deg)
 *   --g-strength normalized [0..1] for any extra CSS hooks
 *
 * The `[data-suck]` rule in cosmic.css consumes those vars via `transform`.
 *
 * Strength falls off ~quadratically past INFLUENCE px from the BH center, and
 * is amplified when the cursor hovers near an element (the hole "notices it").
 *
 * Re-runs the layout pass on resize / scroll / mousemove via requestAnimationFrame.
 *
 * Defaults match the visual position of <BlackHole/> (right edge, top). Override
 * `getCenter` if you reposition the hole.
 */
export interface GravityOptions {
  /** Returns BH center in viewport coordinates. Default: top-right of the viewport. */
  getCenter?: () => { x: number; y: number };
  /** Pixel range at which gravity reaches zero. Default 1100. */
  influence?: number;
}

const defaultCenter = () => ({ x: window.innerWidth - 220, y: 180 });
const EVENT_HORIZON_SOFT_LIMIT = 92;
const OFFSCREEN_MARGIN = 220;

interface GravityState {
  tx: number;
  ty: number;
  skewX: number;
  skewY: number;
  strength: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function settle(next: number, current: number) {
  return Math.abs(next - current) < 0.025 ? current : next;
}

function writeGravity(el: HTMLElement, state: GravityState) {
  el.style.setProperty("--g-tx", state.tx.toFixed(2) + "px");
  el.style.setProperty("--g-ty", state.ty.toFixed(2) + "px");
  el.style.setProperty("--g-skewx", state.skewX.toFixed(2) + "deg");
  el.style.setProperty("--g-skewy", state.skewY.toFixed(2) + "deg");
  el.style.setProperty("--g-strength", state.strength.toFixed(3));
}

export function useGravity(options: GravityOptions = {}) {
  useEffect(() => {
    const getCenter = options.getCenter ?? defaultCenter;
    const INFLUENCE = options.influence ?? 1100;

    let raf: number | null = null;
    let scrollTimer: number | null = null;
    const mouse = { x: -9999, y: -9999, active: false };
    const states = new WeakMap<HTMLElement, GravityState>();

    function update() {
      const c = getCenter();
      const suckables = document.querySelectorAll<HTMLElement>("[data-suck]");
      suckables.forEach((el) => {
        const previous = states.get(el) ?? { tx: 0, ty: 0, skewX: 0, skewY: 0, strength: 0 };
        const r = el.getBoundingClientRect();

        if (
          r.bottom < -OFFSCREEN_MARGIN ||
          r.top > window.innerHeight + OFFSCREEN_MARGIN ||
          r.right < -OFFSCREEN_MARGIN ||
          r.left > window.innerWidth + OFFSCREEN_MARGIN
        ) {
          const reset = {
            tx: settle(previous.tx * 0.72, previous.tx),
            ty: settle(previous.ty * 0.72, previous.ty),
            skewX: settle(previous.skewX * 0.72, previous.skewX),
            skewY: settle(previous.skewY * 0.72, previous.skewY),
            strength: previous.strength * 0.72
          };
          states.set(el, reset);
          writeGravity(el, reset);
          return;
        }

        // getBoundingClientRect() includes the transform we wrote last frame.
        // Subtract the previous translation so scrolling near the black hole does not
        // feed transformed coordinates back into the next gravity calculation.
        const ex = r.left + r.width / 2 - previous.tx;
        const ey = r.top + r.height / 2 - previous.ty;
        const dx = c.x - ex;
        const dy = c.y - ey;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < EVENT_HORIZON_SOFT_LIMIT) {
          states.set(el, previous);
          writeGravity(el, previous);
          return;
        }

        const baseFactor = Math.max(0, 1 - dist / INFLUENCE);
        const mdx = mouse.x - ex;
        const mdy = mouse.y - ey;
        const mDist = Math.sqrt(mdx * mdx + mdy * mdy);
        const mFactor = mouse.active ? Math.max(0, 1 - mDist / 220) : 0;
        const eventHorizonDamp = clamp((dist - EVENT_HORIZON_SOFT_LIMIT) / 260, 0, 1);

        const strength = (baseFactor * baseFactor * 24 + mFactor * mFactor * 12) * eventHorizonDamp;
        const targetTx = clamp((dx / dist) * strength, -22, 22);
        const targetTy = clamp((dy / dist) * strength, -22, 22);

        const ang = Math.atan2(dy, dx);
        const skewMag = (baseFactor * baseFactor * 2.8 + mFactor * 1.1) * eventHorizonDamp;
        const targetSkewX = clamp(Math.cos(ang) * skewMag, -3.2, 3.2);
        const targetSkewY = clamp(Math.sin(ang) * skewMag * 0.5, -1.8, 1.8);
        const alpha = 0.24;
        const next = {
          tx: settle(previous.tx + (targetTx - previous.tx) * alpha, previous.tx),
          ty: settle(previous.ty + (targetTy - previous.ty) * alpha, previous.ty),
          skewX: settle(previous.skewX + (targetSkewX - previous.skewX) * alpha, previous.skewX),
          skewY: settle(previous.skewY + (targetSkewY - previous.skewY) * alpha, previous.skewY),
          strength: previous.strength + (baseFactor - previous.strength) * alpha
        };

        states.set(el, next);
        writeGravity(el, next);
      });
      raf = null;
    }

    function schedule() {
      if (raf != null) return;
      raf = requestAnimationFrame(update);
    }

    function handleMove(e: MouseEvent) {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      mouse.active = true;
      schedule();
    }
    function handleLeave() {
      mouse.active = false;
      schedule();
    }
    function handleScroll() {
      // During scroll the pointer often stays over a moving element. Disabling
      // pointer amplification for that frame prevents button shake near the horizon.
      mouse.active = false;
      if (scrollTimer != null) {
        window.clearTimeout(scrollTimer);
      }
      scrollTimer = window.setTimeout(() => {
        scrollTimer = null;
      }, 120);
      schedule();
    }

    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("mousemove", handleMove, { passive: true });
    window.addEventListener("mouseleave", handleLeave);

    update();
    const t1 = window.setTimeout(update, 100);
    const t2 = window.setTimeout(update, 600);
    // Re-scan after DOM updates (route changes, list re-renders)
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseleave", handleLeave);
      observer.disconnect();
      if (raf != null) cancelAnimationFrame(raf);
      if (scrollTimer != null) window.clearTimeout(scrollTimer);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [options.getCenter, options.influence]);
}
