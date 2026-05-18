# Cosmic Minimalism — drop-in package

A self-contained visual layer that gives any page the "matches" mockup look:
black hole in the top-right corner, gravity that pulls UI toward it, and a slow
stream of particles being swallowed.

## Files

| File                    | What it is                                                |
| ----------------------- | --------------------------------------------------------- |
| `cosmic.css`            | All styling — tokens, BH animations, UI primitives, particles. |
| `BlackHole.tsx`         | Pure SVG component for the BH + inflow wisps.            |
| `useGravity.ts`         | Hook — pulls every `[data-suck]` element toward the BH.  |
| `useParticles.ts`       | Hook — spawns DOM particles streaming into the BH.       |
| `CosmicBackdrop.tsx`    | One-component wrapper that installs everything.          |
| `index.ts`              | Barrel re-exports.                                       |

## Quick start

1. Copy this folder into your project, e.g. `web/src/cosmic/`.
2. Import the stylesheet **once** in your app entry (e.g. `main.tsx`):

   ```ts
   import "./cosmic/cosmic.css";
   ```

   Make sure the cosmic fonts are loaded — either keep the `@import` line at the
   top of `cosmic.css`, or add a `<link>` to `index.html`:

   ```html
   <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=JetBrains+Mono:wght@300;400;500&family=Inter:wght@300;400;450;500;600&display=swap" rel="stylesheet">
   ```

3. Mount the backdrop once at the page root:

   ```tsx
   import { CosmicBackdrop } from "./cosmic";

   export function MatchesPage() {
     return (
       <>
         <CosmicBackdrop />
         {/* the rest of your page */}
       </>
     );
   }
   ```

4. Tag any element that should react to gravity with `data-suck`:

   ```tsx
   <div className="stat" data-suck>…</div>
   <button className="chip" data-suck>Pro games</button>
   <a className="btn" data-suck="strong">Open</a>
   ```

   `data-suck="strong"` shortens the easing time for elements that should feel
   more responsive (rows, buttons).

## Customizing

`<CosmicBackdrop getCenter={() => ({ x: 200, y: 200 })} />` repositions the BH
center for the gravity + particle calculations (visual position is controlled
by the `.orbits svg` rule in `cosmic.css`).

The two hooks can be used independently if you want full control over the SVG:

```ts
useGravity({ influence: 1400 });
useParticles({ horizonRadius: 200, intervalMs: 200 });
```

## Notes

* All animation is CSS — JS only computes positions and spawns DOM nodes.
* Particles use `offset-path`. Browser support: Chrome 55+, Firefox 72+,
  Safari 16+. If you need older Safari, swap `offset-path` for `translate`
  keyframes (see git history in the original `Matches.html`).
* The CSS file ships with every utility class used by the mockup (rows,
  chips, search field, hero portraits, etc.) so the look stays consistent
  with the prototype. If you already have these primitives, prune the file.
