import React, { useEffect, useRef, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, NavLink, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { Database, ListChecks, LogOut, Shield, Swords, UploadCloud } from "lucide-react";
import { adminLogout, getAdminSession, type AdminSession } from "./api/client";
import { AdminLoginPage } from "./pages/AdminLoginPage";
import { CosmicBackdrop, type CosmicScene } from "./cosmic";
import { HeroPage } from "./pages/HeroPage";
import { HeroesPage } from "./pages/HeroesPage";
import { HomePage } from "./pages/HomePage";
import { JobsPage } from "./pages/JobsPage";
import { MatchPage } from "./pages/MatchPage";
import { UploadPage } from "./pages/UploadPage";
import "./styles/app.css";
import "./styles/tactical-art-direction.css";
import "./styles/tactical-header.css";
import "./styles/tactical-match-cards.css";
import "./styles/tactical-motion.css";
import "./styles/tactical-responsive.css";
import "./styles/cloud-architecture.css";
import "./cosmic/cosmic.css";

function App() {
  const [session, setSession] = useState<AdminSession | null>(null);

  async function refreshSession() {
    const nextSession = await getAdminSession().catch(() => ({ configured: false, authenticated: false }));
    setSession(nextSession);
  }

  async function handleLogout() {
    await adminLogout().catch(() => undefined);
    await refreshSession();
  }

  useEffect(() => {
    refreshSession();
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/matches" replace />} />
        <Route element={<PublicLayout />}>
          <Route path="/matches" element={<HomePage />} />
          <Route path="/matches/:id" element={<MatchPage />} />
          <Route path="/heroes" element={<HeroesPage />} />
          <Route path="/heroes/:heroKey" element={<HeroPage />} />
        </Route>
        <Route path="/admin/login" element={<AdminLoginPage onLogin={refreshSession} />} />
        <Route path="/admin" element={<AdminGate session={session}><AdminLayout onLogout={handleLogout}><HomePage admin /></AdminLayout></AdminGate>} />
        <Route path="/admin/matches" element={<AdminGate session={session}><AdminLayout onLogout={handleLogout}><HomePage admin /></AdminLayout></AdminGate>} />
        <Route path="/admin/matches/:id" element={<AdminGate session={session}><AdminLayout onLogout={handleLogout}><MatchPage admin /></AdminLayout></AdminGate>} />
        <Route path="/admin/upload" element={<AdminGate session={session}><AdminLayout onLogout={handleLogout}><UploadPage /></AdminLayout></AdminGate>} />
        <Route path="/admin/jobs" element={<AdminGate session={session}><AdminLayout onLogout={handleLogout}><JobsPage /></AdminLayout></AdminGate>} />
        <Route path="*" element={<Navigate to="/matches" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

type OrbitTravel = "idle" | "clockwise" | "counter";

function PublicLayout({ children }: { children?: ReactNode }) {
  const location = useLocation();
  const isCosmicRoute = location.pathname.startsWith("/matches") || location.pathname.startsWith("/heroes");
  const cosmicScene = getCosmicScene(location.pathname);
  const previousScene = useRef<CosmicScene>(cosmicScene);
  const [travel, setTravel] = useState<OrbitTravel>("idle");

  useEffect(() => {
    if (!isCosmicRoute) {
      previousScene.current = cosmicScene;
      setTravel("idle");
      return;
    }

    const previous = previousScene.current;
    if (previous === cosmicScene) {
      return;
    }

    setTravel(getOrbitTravelDirection(previous, cosmicScene));
    previousScene.current = cosmicScene;
    const timeout = window.setTimeout(() => setTravel("idle"), 980);
    return () => window.clearTimeout(timeout);
  }, [cosmicScene, isCosmicRoute]);

  const orbitClass = isCosmicRoute
    ? ` orbitScene orbit-${cosmicScene}${travel !== "idle" ? ` orbitTraveling orbit-${travel}` : ""}`
    : "";

  return (
    <div className={`appShell publicShell${orbitClass}`}>
      {isCosmicRoute ? <CosmicBackdrop scene={cosmicScene} /> : <NetworkBackdrop />}
      {isCosmicRoute ? (
        <div className="orbitTravelOverlay" aria-hidden="true">
          <span className="orbitTravelArc orbitTravelArcA" />
          <span className="orbitTravelArc orbitTravelArcB" />
          <span className="orbitTravelComet" />
        </div>
      ) : null}
      <aside className="sidebar">
        <Brand subtitle="public replay archive" />
        <nav className="side-nav" aria-label="Public navigation">
          <NavLink to="/matches">
            <Database size={18} />
            Matches
          </NavLink>
          <NavLink to="/heroes">
            <Swords size={18} />
            Heroes
          </NavLink>
          <NavLink to="/admin/login">
            <Shield size={18} />
            Admin
          </NavLink>
        </nav>
        <div className="side-note">
          Search matches, inspect stats, download replays.
        </div>
      </aside>
      <main className="orbitPage">{children ?? <Outlet />}</main>
    </div>
  );
}

function AdminLayout({ children, onLogout }: { children: ReactNode; onLogout: () => Promise<void> }) {
  const location = useLocation();
  const isMatchesRoute = location.pathname === "/admin" || location.pathname.startsWith("/admin/matches");

  return (
    <div className="appShell">
      {isMatchesRoute ? <CosmicBackdrop scene={getCosmicScene(location.pathname.replace("/admin", "") || "/matches")} /> : <NetworkBackdrop />}
      <aside className="sidebar adminSidebar">
        <Brand subtitle="admin controls" />
        <nav className="side-nav" aria-label="Admin navigation">
          <NavLink to="/admin/matches">
            <Database size={18} />
            Matches
          </NavLink>
          <NavLink to="/admin/upload">
            <UploadCloud size={18} />
            Upload
          </NavLink>
          <NavLink to="/admin/jobs">
            <ListChecks size={18} />
            Jobs
          </NavLink>
        </nav>
        <button className="sidebarButton" onClick={onLogout} type="button">
          <LogOut size={16} />
          Logout
        </button>
      </aside>
      <main>{children}</main>
    </div>
  );
}

function getCosmicScene(pathname: string): CosmicScene {
  if (pathname.startsWith("/heroes/")) {
    return "hero";
  }
  if (pathname === "/heroes") {
    return "heroes";
  }
  if (pathname.startsWith("/matches/")) {
    return "match";
  }
  return "matches";
}

function getOrbitTravelDirection(from: CosmicScene, to: CosmicScene): Exclude<OrbitTravel, "idle"> {
  const order: CosmicScene[] = ["matches", "match", "hero", "heroes"];
  const fromIndex = order.indexOf(from);
  const toIndex = order.indexOf(to);
  if (fromIndex === -1 || toIndex === -1) {
    return "clockwise";
  }
  const delta = (toIndex - fromIndex + order.length) % order.length;
  return delta > 0 && delta <= order.length / 2 ? "clockwise" : "counter";
}

function AdminGate({ children, session }: { children: ReactNode; session: AdminSession | null }) {
  if (!session) {
    return (
      <div className="page">
        <div className="loadingBlock">Checking admin session</div>
      </div>
    );
  }
  if (!session.authenticated) {
    return <Navigate to="/admin/login" replace />;
  }
  return <>{children}</>;
}

function Brand({ subtitle }: { subtitle: string }) {
  return (
    <div className="brand">
      <div className="brand-mark">
        <span className="brand-glyph" aria-hidden="true">
          <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.2">
            <circle cx="11" cy="11" r="9.4" stroke="rgba(255,255,255,0.4)" />
            <circle cx="11" cy="11" r="5" stroke="rgba(255,255,255,0.7)" />
            <circle cx="11" cy="11" r="1.4" fill="white" stroke="none" />
          </svg>
        </span>
        <span className="brand-name">DOTA·REPLAY</span>
      </div>
      <div className="brand-sub">{subtitle}</div>
    </div>
  );
}

function NetworkBackdrop() {
  return (
    <div className="networkBackdrop" aria-hidden="true">
      <svg viewBox="0 0 1440 820" preserveAspectRatio="none">
        <path className="networkPath pathA" d="M74 196 C220 110 320 330 492 244 S780 114 930 230 S1170 380 1366 210" />
        <path className="networkPath pathB" d="M46 612 C214 520 300 628 468 544 S782 498 964 584 S1210 704 1394 560" />
        <path className="networkPath pathC" d="M238 82 C420 220 502 128 684 250 S880 474 1090 356 S1248 258 1412 342" />
        <path className="networkPath pathD" d="M154 756 C284 672 410 734 572 642 S838 650 1012 468 S1218 442 1330 338" />
      </svg>
      <span className="networkNode nodeA" />
      <span className="networkNode nodeB" />
      <span className="networkNode nodeC" />
      <span className="networkNode nodeD" />
      <span className="networkNode nodeE" />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
