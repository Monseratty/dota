import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, NavLink, Navigate, Route, Routes } from "react-router-dom";
import { Activity, Database, FolderSearch, ListChecks, RefreshCw } from "lucide-react";
import { HomePage } from "./pages/HomePage";
import { JobsPage } from "./pages/JobsPage";
import { MatchPage } from "./pages/MatchPage";
import "./styles/app.css";

function App() {
  return (
    <BrowserRouter>
      <div className="appShell">
        <aside className="sidebar">
          <div className="brand">
            <Activity size={22} />
            <div>
              <strong>Dota Replay</strong>
              <span>local parser</span>
            </div>
          </div>
          <nav>
            <NavLink to="/" end>
              <FolderSearch size={18} />
              Inbox
            </NavLink>
            <NavLink to="/matches">
              <Database size={18} />
              Matches
            </NavLink>
            <NavLink to="/jobs">
              <ListChecks size={18} />
              Jobs
            </NavLink>
          </nav>
          <div className="sidebarNote">
            <RefreshCw size={16} />
            Drop `.dem` files into the watch folder and rescan.
          </div>
        </aside>
        <main>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/matches" element={<HomePage />} />
            <Route path="/jobs" element={<JobsPage />} />
            <Route path="/matches/:id" element={<MatchPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
