/**
 * BlackHole — pure SVG backdrop.
 *
 * Renders the black hole sphere, plasma blobs, photon rim, warm halo,
 * ambient orbit dust and the inflow wisps.
 *
 * All animation is driven by CSS classes defined in `cosmic.css`.
 * The component is purely decorative (aria-hidden), pointer-events:none,
 * and sits at z-index 0 so the rest of the UI floats above it.
 */
export function BlackHole() {
  return (
    <>
      {/* Refined black hole backdrop */}
      <div className="orbits" aria-hidden="true">
        <svg viewBox="0 0 1600 1600">
          <defs>
            <radialGradient id="haloGrad" cx="50%" cy="50%" r="50%">
              <stop offset="14%" stopColor="rgba(245,242,238,0)" />
              <stop offset="24%" stopColor="rgba(245,243,240,0.34)" />
              <stop offset="40%" stopColor="rgba(235,233,228,0.18)" />
              <stop offset="65%" stopColor="rgba(220,220,218,0.08)" />
              <stop offset="100%" stopColor="rgba(200,200,200,0)" />
            </radialGradient>
            <radialGradient id="glowInner" cx="50%" cy="50%" r="50%">
              <stop offset="55%" stopColor="rgba(250,248,244,0)" />
              <stop offset="68%" stopColor="rgba(250,248,244,0.55)" />
              <stop offset="78%" stopColor="rgba(240,238,232,0.22)" />
              <stop offset="100%" stopColor="rgba(225,222,215,0)" />
            </radialGradient>
            <radialGradient id="plasmaA" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(80,30,15,0.85)" />
              <stop offset="45%" stopColor="rgba(40,15,8,0.45)" />
              <stop offset="100%" stopColor="rgba(20,8,4,0)" />
            </radialGradient>
            <radialGradient id="plasmaB" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(60,40,30,0.7)" />
              <stop offset="55%" stopColor="rgba(30,20,15,0.3)" />
              <stop offset="100%" stopColor="rgba(10,8,5,0)" />
            </radialGradient>
          </defs>

          {/* Ambient orbit dust */}
          <g className="o-ring-1"><circle className="orbit-ring bold" cx="800" cy="800" r="420" /></g>
          <g className="o-ring-2"><circle className="orbit-ring" cx="800" cy="800" r="560" /></g>
          <g className="o-ring-3"><circle className="orbit-ring" cx="800" cy="800" r="720" /></g>
          <g className="o-dot-1"><circle className="orbit-dot" cx="1220" cy="800" r="1.6" /></g>
          <g className="o-dot-2"><circle className="orbit-dot" cx="800" cy="240" r="1.2" /></g>
          <g className="o-dot-3"><circle className="orbit-dot" cx="80" cy="800" r="1.4" /></g>

          <g className="bh-breathe">
            {/* Outer warm halo, soft and wide */}
            <circle className="bh-halo" cx="800" cy="800" r="640" />
            <circle className="bh-halo" cx="800" cy="800" r="420" opacity="0.7" />

            {/* Inner ring of light just outside the sphere */}
            <circle className="bh-glow-inner" cx="800" cy="800" r="320" />

            <g className="bh-distort">
              {/* Plasma blobs orbiting just inside the rim */}
              <g className="bh-rotor-slow">
                <ellipse className="bh-plasma" cx="660" cy="800" rx="140" ry="220" />
                <ellipse className="bh-plasma" cx="950" cy="780" rx="170" ry="180" transform="rotate(35 950 780)" />
                <ellipse className="bh-plasma-b" cx="820" cy="920" rx="180" ry="120" transform="rotate(-20 820 920)" />
              </g>
              <g className="bh-rotor-rev">
                <ellipse className="bh-plasma-b" cx="820" cy="670" rx="160" ry="100" />
                <ellipse className="bh-plasma-b" cx="700" cy="900" rx="120" ry="160" transform="rotate(40 700 900)" />
                <ellipse className="bh-plasma" cx="900" cy="700" rx="100" ry="170" transform="rotate(-25 900 700)" />
              </g>

              {/* Sphere */}
              <circle className="bh-sphere" cx="800" cy="800" r="240" />
            </g>

            {/* Photon rim */}
            <circle className="bh-rim" cx="800" cy="800" r="244" />
            <circle className="bh-rim-soft" cx="800" cy="800" r="252" />
            <circle className="bh-rim-warp" cx="800" cy="800" r="262" />
          </g>
        </svg>
      </div>

      {/* Inflow wisps — subtle pull */}
      <div className="inflow" aria-hidden="true">
        <svg viewBox="0 0 1600 900" preserveAspectRatio="xMaxYMin slice">
          <g stroke="rgba(248,246,242,0.45)" strokeLinecap="round" strokeWidth="0.7">
            <line className="inflow-line flow-anim d1" x1="50"   y1="800" x2="1340" y2="225" strokeDasharray="3 1300" />
            <line className="inflow-line flow-anim d3" x1="600"  y1="900" x2="1355" y2="220" strokeDasharray="2 1000" />
            <line className="inflow-line flow-anim d5" x1="900"  y1="900" x2="1370" y2="230" strokeDasharray="3 900" />
            <line className="inflow-line flow-anim"    x1="0"    y1="200" x2="1330" y2="210" strokeDasharray="4 1500" />
            <line className="inflow-line flow-anim d4" x1="350"  y1="900" x2="1350" y2="230" strokeDasharray="2 1100" />
            <line className="inflow-line flow-anim d2" x1="1100" y1="800" x2="1380" y2="225" strokeDasharray="2 800" />
            <line className="inflow-line flow-anim d6" x1="200"  y1="500" x2="1340" y2="215" strokeDasharray="3 1200" />
            <line className="inflow-line flow-anim d3" x1="800"  y1="50"  x2="1370" y2="215" strokeDasharray="2 1000" />
          </g>
        </svg>
      </div>
    </>
  );
}
