import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArchiveX, Download, ExternalLink, Loader2, RefreshCw, RotateCcw, Search, Trash2 } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { deleteMatch, deleteRawReplay, downloadUrl, getMatches, getStorageInfo, reparseMatch, rescanFolder, type MatchListItem, type StorageInfo } from "../api/client";
import { TableSkeleton } from "../components/ui";

type SortMode = "newest" | "matchId" | "duration" | "score";
type QuickFilter = "pro" | "radiant" | "dire" | "downloadable";

interface HomePageProps {
  admin?: boolean;
}

const quickFilterOptions: Array<{ value: QuickFilter; label: string }> = [
  { value: "pro", label: "Pro games" },
  { value: "radiant", label: "Radiant won" },
  { value: "dire", label: "Dire won" },
  { value: "downloadable", label: "Downloadable" }
];

export function HomePage({ admin = false }: HomePageProps) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [matches, setMatches] = useState<MatchListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [rescanning, setRescanning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [query, setQuery] = useState(() => searchParams.get("q") || "");
  const [statusFilter, setStatusFilter] = useState<"all" | MatchListItem["status"]>(() => readStatusFilter(searchParams.get("status")));
  const [sortMode, setSortMode] = useState<SortMode>(() => readSortMode(searchParams.get("sort")));
  const [quickFilters, setQuickFilters] = useState<QuickFilter[]>(() => readQuickFilters(searchParams.get("quick")));

  async function refresh() {
    const [nextStorage, nextMatches] = await Promise.all([
      admin ? getStorageInfo() : Promise.resolve(null),
      getMatches()
    ]);
    setStorage(nextStorage);
    setMatches(nextMatches);
    setError(null);
  }

  useEffect(() => {
    refresh()
      .catch((error) => setError(error instanceof Error ? error.message : "Failed to load matches"))
      .finally(() => setLoading(false));

    const timer = window.setInterval(() => {
      refresh().catch(() => undefined);
    }, 5000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    setOrDelete(next, "q", query.trim());
    setOrDelete(next, "sort", sortMode === "newest" ? "" : sortMode);
    setOrDelete(next, "quick", quickFilters.length > 0 ? quickFilters.join(",") : "");
    setOrDelete(next, "status", admin && statusFilter !== "all" ? statusFilter : "");

    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [admin, query, quickFilters, searchParams, setSearchParams, sortMode, statusFilter]);

  const totals = useMemo(() => {
    const heroSet = new Set(matches.flatMap((match) => match.heroes || []));
    const proSet = new Set(matches.flatMap((match) => match.proPlayers || []));
    const readyMatches = matches.filter((match) => match.status === "ready");

    return {
      all: matches.length,
      queued: matches.filter((match) => match.status === "queued").length,
      parsing: matches.filter((match) => match.status === "parsing").length,
      ready: matches.filter((match) => match.status === "ready").length,
      failed: matches.filter((match) => match.status === "failed").length,
      uploadedToday: matches.filter((match) => isToday(match.rawUploadedAt || match.discoveredAt)).length,
      heroes: heroSet.size,
      pros: proSet.size,
      latest: readyMatches
        .map((match) => match.discoveredAt)
        .sort((left, right) => timeValue(right) - timeValue(left))[0] || null
    };
  }, [matches]);

  const quickFilterCounts = useMemo(() => {
    const publicSafeMatches = matches.filter((match) => admin || match.status === "ready");
    return {
      pro: publicSafeMatches.filter((match) => (match.proPlayers || []).length > 0).length,
      radiant: publicSafeMatches.filter((match) => String(match.winner || "").toLowerCase() === "radiant").length,
      dire: publicSafeMatches.filter((match) => String(match.winner || "").toLowerCase() === "dire").length,
      downloadable: publicSafeMatches.filter((match) => Boolean(match.downloadUrl)).length
    };
  }, [admin, matches]);

  const filteredMatches = useMemo(() => {
    const terms = searchTerms(query);
    const filtered = matches.filter((match) => {
      if (!admin && match.status !== "ready") {
        return false;
      }
      const statusMatches = !admin || statusFilter === "all" || match.status === statusFilter;
      if (!statusMatches) {
        return false;
      }
      if (quickFilters.includes("pro") && (match.proPlayers || []).length === 0) {
        return false;
      }
      if (quickFilters.includes("radiant") && String(match.winner || "").toLowerCase() !== "radiant") {
        return false;
      }
      if (quickFilters.includes("dire") && String(match.winner || "").toLowerCase() !== "dire") {
        return false;
      }
      if (quickFilters.includes("downloadable") && !match.downloadUrl) {
        return false;
      }
      if (terms.length === 0) {
        return true;
      }

      const searchable = [
        match.matchId,
        match.sourceFilename,
        match.winner,
        match.status,
        match.errorMessage,
        ...(match.heroes || []),
        ...(match.heroes || []).map((hero) => canonicalHeroName(hero)),
        ...(match.proPlayers || [])
      ].map((value) => String(value || "").toLowerCase()).join(" ");

      return terms.every((term) => searchable.includes(term));
    });

    return filtered.sort((left, right) => compareMatches(left, right, sortMode));
  }, [admin, matches, query, quickFilters, sortMode, statusFilter]);

  async function handleRescan() {
    setRescanning(true);
    setMessage(null);
    try {
      const result = await rescanFolder();
      setMessage(`Scanned ${result.scanned}, imported ${result.imported}`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Rescan failed");
    } finally {
      setRescanning(false);
    }
  }

  async function handleDelete(match: MatchListItem) {
    if (!window.confirm(`Delete match ${match.matchId || match.sourceFilename}?`)) {
      return;
    }
    setPendingAction(`delete-${match.id}`);
    try {
      await deleteMatch(match.id);
      await refresh();
    } finally {
      setPendingAction(null);
    }
  }

  async function handleReparse(match: MatchListItem) {
    setPendingAction(`reparse-${match.id}`);
    try {
      await reparseMatch(match.id);
      await refresh();
    } finally {
      setPendingAction(null);
    }
  }

  async function handleDeleteRaw(match: MatchListItem) {
    if (!window.confirm(`Remove raw replay for ${match.matchId || match.sourceFilename}? Parsed stats will stay available.`)) {
      return;
    }
    setPendingAction(`raw-${match.id}`);
    try {
      await deleteRawReplay(match.id);
      await refresh();
    } finally {
      setPendingAction(null);
    }
  }

  function toggleQuickFilter(filter: QuickFilter) {
    setQuickFilters((current) => current.includes(filter)
      ? current.filter((item) => item !== filter)
      : [...current, filter]);
  }

  function clearFilters() {
    setQuery("");
    setStatusFilter("all");
    setQuickFilters([]);
    setSortMode("newest");
  }

  return (
    <div className={`page matchesPage ${admin ? "adminPage" : "publicPage"}`}>
        <header className="page-head">
          <div className="head-title">
            <div className="eyebrow">{admin ? "Admin panel" : "High MMR · Replay Archive"}</div>
            <h1>{admin ? "Replay inbox" : "Matches"}<em>.</em></h1>
            <p>
              {admin
                ? "Monitor imports, parser status and replay storage."
                : "Search parsed Dota 2 replays by match ID, hero combination or pro player."}
            </p>
          </div>
          <div className="head-meta">
            <span className="live">{loading ? "SYNC · LOADING" : "SYNC · LIVE"}</span>
            <span>{filteredMatches.length}/{matches.length} shown</span>
            {admin ? (
              <button className="btn" data-suck="strong" onClick={handleRescan} disabled={rescanning} type="button">
                {rescanning ? <Loader2 className="spin" size={14} /> : <RefreshCw size={14} />}
                Rescan folder
              </button>
            ) : (
              <span>parser · {loading ? "loading" : "ready"}</span>
            )}
          </div>
        </header>

        <section className="stats" aria-label={admin ? "Admin overview" : "Archive overview"}>
          {admin ? (
            <>
              <StatBlock label="Matches" value={totals.all} delta={`${totals.parsing} parsing`} />
              <StatBlock label="Queued" value={totals.queued} delta="waiting parse" />
              <StatBlock label="Ready" value={totals.ready} delta="available" />
              <StatBlock label="Failed" value={totals.failed} delta={totals.failed > 0 ? "needs review" : "clean"} />
              <StatBlock label="Uploaded today" value={totals.uploadedToday} delta="local day" />
            </>
          ) : (
            <>
              <StatBlock label="Ready matches" value={totals.ready} delta={`${quickFilterCounts.downloadable} downloadable`} />
              <StatBlock label="Heroes indexed" value={totals.heroes} delta="from parsed data" />
              <StatBlock label="Pro players" value={totals.pros} delta={`${quickFilterCounts.pro} pro games`} />
              <StatBlock label="Latest match" value={totals.latest ? formatShortDate(totals.latest) : "-"} delta="game date" compact />
            </>
          )}
        </section>

        {admin ? (
          <section className="storage-panel">
            <div className="table-status">
              <span>Storage</span>
              <span className="right">{storage ? "active" : "loading"}</span>
            </div>
            <div className="pathGrid">
              <PathLabel label="Inbox" value={storage?.inboxPath} />
              <PathLabel label="Raw demos" value={storage?.rawDemoPath} />
              <PathLabel label="Parsed" value={storage?.parsedPath} />
              <PathLabel label="Database" value={storage?.databasePath} />
              <PathLabel
                label="Replay archive"
                value={storage?.replayStorage?.driver === "s3"
                  ? `${storage.replayStorage.bucket} @ ${storage.replayStorage.region}`
                  : "local only"}
              />
            </div>
          </section>
        ) : null}

        {message ? <div className="notice">{message}</div> : null}
        {error ? (
          <div className="notice danger actionNotice">
            <span>{error}</span>
            <button className="chip-clear" onClick={() => refresh()} type="button">Retry</button>
          </div>
        ) : null}

        <div className="toolbar">
          <label className="search" data-suck>
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search match ID, hero, pro player — try Axe + Pudge" />
            <span className="search-hint">⌘ K</span>
          </label>
          <label className="select" data-suck>
            <span className="k">Sort</span>
            <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
              <option value="newest">Newest</option>
              <option value="matchId">Match ID</option>
              <option value="duration">Duration</option>
              <option value="score">Total kills</option>
            </select>
          </label>
        </div>

        <div className="filters" aria-label="Quick match filters">
          <span className="filters-label">Filter</span>
          {quickFilterOptions.map((filter) => (
            <button
              className={`chip ${quickFilters.includes(filter.value) ? "active" : ""}`}
              data-suck
              key={filter.value}
              onClick={() => toggleQuickFilter(filter.value)}
              type="button"
            >
              {filter.label}
              <span className="chip-count">{quickFilterCounts[filter.value]}</span>
            </button>
          ))}
          {admin ? (
            <div className="statusFilters" aria-label="Filter matches by status">
              {(["all", "queued", "parsing", "ready", "failed"] as const).map((status) => (
                <button
                  className={`chip ${statusFilter === status ? "active" : ""}`}
                  data-suck
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  type="button"
                >
                  {status}
                  <span className="chip-count">{status === "all" ? totals.all : totals[status] ?? 0}</span>
                </button>
              ))}
            </div>
          ) : null}
          {(query || quickFilters.length > 0 || statusFilter !== "all" || sortMode !== "newest") ? (
            <button className="chip-clear" data-suck onClick={clearFilters} type="button">clear</button>
          ) : null}
        </div>

        <div className="table-status">
          <span>{loading ? "loading" : `${filteredMatches.length} / ${matches.length} shown`}</span>
          <span className="right">Sorted by · {sortLabel(sortMode)}</span>
        </div>

        <div className="table" role="table" aria-label="Matches">
          <div className="row head" role="row">
            <span />
            <span>Match · heroes</span>
            <span>Result</span>
            <span>{admin ? "Size" : "Duration"}</span>
            <span>Game date</span>
            <span style={{ textAlign: "right" }}>Actions</span>
          </div>
          {loading ? <TableSkeleton columns={6} rows={5} /> : null}
          {!loading && filteredMatches.map((match) => (
            <div
              className={`row ${match.status} ${winnerClass(match.winner)}`}
              data-suck="strong"
              key={match.id}
              onClick={(event) => {
                if ((event.target as HTMLElement).closest("a,button,input,select")) {
                  return;
                }
                navigate(admin ? `/admin/matches/${match.id}` : `/matches/${match.id}`);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  navigate(admin ? `/admin/matches/${match.id}` : `/matches/${match.id}`);
                }
              }}
              role="row"
              tabIndex={0}
            >
              <span className="res-bar" />
              <div className="ident">
                <div className="ident-top">
                  <span className="match-id">{match.matchId || match.sourceFilename}</span>
                  <span className="match-meta">
                    <b>{match.winner ? `${match.winner} won` : match.status}</b>
                    {match.radiantScore != null && match.direScore != null ? ` · ${match.radiantScore} - ${match.direScore}` : ""}
                    {match.sourceFilename ? ` · ${match.sourceFilename}` : ""}
                  </span>
                </div>
                <HeroPortraitStrip heroes={match.heroes || []} onHeroClick={setQuery} />
                <MatchTags match={match} onTagClick={setQuery} />
              </div>
              <ScoreCell match={match} admin={admin} />
              <div className="num">
                {admin ? formatBytes(match.fileSize) : formatDuration(match.duration)}
                <small>{admin ? match.status : `${match.proPlayers?.length || 0} pro players`}</small>
              </div>
              <div className="num">
                {formatDateOnly(match.discoveredAt)}
                <small>{formatTimeOnly(match.discoveredAt)} · {match.dashboardReady ? "dashboard ready" : "waiting data"}</small>
              </div>
              <div className="actions">
                <Link className="btn" data-suck="strong" to={admin ? `/admin/matches/${match.id}` : `/matches/${match.id}`} title="Open match">
                  Open
                  <ExternalLink size={14} />
                </Link>
                {match.downloadUrl ? (
                  <a className="btn ghost" data-suck="strong" href={downloadUrl(match.downloadUrl)} title="Download replay">
                    <Download size={14} />
                    {!admin ? <span>Download</span> : null}
                  </a>
                ) : null}
                {admin && match.hasRawDemo ? (
                  <button className="btn ghost" data-suck="strong" onClick={() => handleReparse(match)} title="Reparse match" disabled={pendingAction === `reparse-${match.id}`} type="button">
                    <RotateCcw className={pendingAction === `reparse-${match.id}` ? "spin" : ""} size={14} />
                  </button>
                ) : null}
                {admin && match.hasRawDemo ? (
                  <button className="btn ghost" data-suck="strong" onClick={() => handleDeleteRaw(match)} title="Remove raw replay only" disabled={pendingAction === `raw-${match.id}`} type="button">
                    <ArchiveX size={14} />
                  </button>
                ) : null}
                {admin ? (
                  <button className="btn ghost danger" data-suck="strong" onClick={() => handleDelete(match)} title="Delete match" disabled={pendingAction === `delete-${match.id}`} type="button">
                    <Trash2 size={14} />
                  </button>
                ) : null}
              </div>
            </div>
          ))}
          {!loading && matches.length === 0 ? (
            <div className="emptyState">
              <strong>{admin ? "No demos imported yet." : "No matches imported yet."}</strong>
              <span>{admin ? "Upload `.dem` files from the Upload page or run a folder rescan." : "Parsed matches will appear here after import."}</span>
            </div>
          ) : null}
          {!loading && matches.length > 0 && filteredMatches.length === 0 ? (
            <div className="emptyState">
              <strong>No matches fit this filter.</strong>
              <button className="chip-clear" onClick={clearFilters} type="button">clear filters</button>
            </div>
          ) : null}
        </div>
    </div>
  );
}

function setOrDelete(params: URLSearchParams, key: string, value: string) {
  if (value) {
    params.set(key, value);
  } else {
    params.delete(key);
  }
}

function readSortMode(value: string | null): SortMode {
  return value === "matchId" || value === "duration" || value === "score" ? value : "newest";
}

function readStatusFilter(value: string | null): "all" | MatchListItem["status"] {
  if (value === "discovered" || value === "queued" || value === "parsing" || value === "ready" || value === "failed" || value === "deleted") {
    return value;
  }
  return "all";
}

function readQuickFilters(value: string | null): QuickFilter[] {
  if (!value) {
    return [];
  }
  const allowed = new Set<QuickFilter>(["pro", "radiant", "dire", "downloadable"]);
  return value
    .split(",")
    .filter((filter): filter is QuickFilter => allowed.has(filter as QuickFilter));
}

function StatBlock({ compact = false, delta, label, value }: { compact?: boolean; delta: string; label: string; value: ReactNode }) {
  return (
    <div className="stat" data-suck>
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={compact ? { fontSize: 24, paddingTop: 8 } : undefined}>{value}</div>
      <div className="stat-delta">{delta}</div>
    </div>
  );
}

function ScoreCell({ admin, match }: { admin: boolean; match: MatchListItem }) {
  if (match.radiantScore == null || match.direScore == null) {
    return (
      <div>
        <div className="score">—</div>
        <div className="winner">{match.status}</div>
      </div>
    );
  }

  const winner = String(match.winner || "").toLowerCase();
  return (
    <div>
      <div className="score">
        <span className="a">{match.radiantScore}</span>
        <span className="vs">—</span>
        <span className="b">{match.direScore}</span>
      </div>
      <div className="winner">
        {winner ? `${capitalize(winner)} won` : "score pending"}
        {admin ? ` · ${match.status}` : ""}
      </div>
    </div>
  );
}

function MatchTags({ match, onTagClick }: { match: MatchListItem; onTagClick: (value: string) => void }) {
  const heroes = match.heroes || [];
  const pros = match.proPlayers || [];
  if (heroes.length === 0 && pros.length === 0) {
    return null;
  }

  return (
    <div className="tags">
      {heroes.map((hero) => (
        <button className="tag" key={`hero-${hero}`} onClick={() => onTagClick(hero)} type="button">{canonicalHeroName(hero)}</button>
      ))}
      {pros.map((player) => (
        <button className="tag pro" key={`pro-${player}`} onClick={() => onTagClick(player)} type="button">{player}</button>
      ))}
    </div>
  );
}

function HeroPortraitStrip({ heroes, onHeroClick }: { heroes: string[]; onHeroClick: (value: string) => void }) {
  if (heroes.length === 0) {
    return <div className="heroes empty">No hero data yet</div>;
  }

  const shown = heroes.slice(0, 10);
  return (
    <div className="heroes" aria-label="Heroes in match">
      {shown.map((hero, index) => (
        <FragmentWithSeparator key={hero} showSeparator={index === 5}>
          <button className="hero" onClick={() => onHeroClick(hero)} title={canonicalHeroName(hero)} type="button">
            <img src={heroAsset(hero)} alt="" onError={(event) => event.currentTarget.style.display = "none"} />
          </button>
        </FragmentWithSeparator>
      ))}
      {heroes.length > shown.length ? <span className="more">+{heroes.length - shown.length}</span> : null}
    </div>
  );
}

function FragmentWithSeparator({ children, showSeparator }: { children: ReactNode; showSeparator: boolean }) {
  return (
    <>
      {showSeparator ? <span className="sep" /> : null}
      {children}
    </>
  );
}

function compareMatches(left: MatchListItem, right: MatchListItem, sortMode: SortMode): number {
  if (sortMode === "matchId") {
    return Number(right.matchId || 0) - Number(left.matchId || 0);
  }
  if (sortMode === "duration") {
    return Number(right.duration || 0) - Number(left.duration || 0);
  }
  if (sortMode === "score") {
    return totalKills(right) - totalKills(left);
  }
  return timeValue(right.discoveredAt) - timeValue(left.discoveredAt);
}

function winnerClass(winner: string | null): string {
  const normalized = String(winner || "").toLowerCase();
  if (normalized === "radiant") {
    return "radiant";
  }
  if (normalized === "dire") {
    return "dire";
  }
  return "";
}

function totalKills(match: MatchListItem): number {
  return Number(match.radiantScore || 0) + Number(match.direScore || 0);
}

function timeValue(value: string | null): number {
  return value ? new Date(value).getTime() : 0;
}

function sortLabel(value: SortMode): string {
  if (value === "matchId") {
    return "Match ID";
  }
  if (value === "duration") {
    return "Duration";
  }
  if (value === "score") {
    return "Total kills";
  }
  return "Newest";
}

function searchTerms(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[+,]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function isToday(value: string | null): boolean {
  if (!value) {
    return false;
  }
  const date = new Date(value);
  const now = new Date();
  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
}

function PathLabel({ label, value }: { label: string; value?: string }) {
  return (
    <div className="pathLabel">
      <span>{label}</span>
      <code>{value || "..."}</code>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function formatDateOnly(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short"
  }).format(new Date(value));
}

function formatTimeOnly(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeStyle: "short"
  }).format(new Date(value));
}

function formatShortDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatDuration(seconds: number | null): string {
  if (!seconds) {
    return "-";
  }
  const safe = Math.max(0, Math.round(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const heroAliases: Record<string, string> = {
  "abyssal underlord": "abyssal_underlord",
  "anti mage": "antimage",
  "anti-mage": "antimage",
  "doom": "doom_bringer",
  "doom bringer": "doom_bringer",
  "io": "wisp",
  "lifestealer": "life_stealer",
  "magnus": "magnataur",
  "natures prophet": "furion",
  "nature's prophet": "furion",
  "necrophos": "necrolyte",
  "outworld destroyer": "obsidian_destroyer",
  "queen of pain": "queenofpain",
  "rattletrap": "rattletrap",
  "shadow fiend": "nevermore",
  "timbersaw": "shredder",
  "vengeful spirit": "vengefulspirit",
  "windranger": "windrunner",
  "wraith king": "skeleton_king",
  "zeus": "zuus"
};

const heroDisplayNames: Record<string, string> = {
  "abyssal underlord": "Underlord",
  "anti mage": "Anti-Mage",
  "antimage": "Anti-Mage",
  "doom bringer": "Doom",
  "furion": "Nature's Prophet",
  "life stealer": "Lifestealer",
  "magnataur": "Magnus",
  "necrolyte": "Necrophos",
  "nevermore": "Shadow Fiend",
  "obsidian destroyer": "Outworld Destroyer",
  "queenofpain": "Queen of Pain",
  "rattletrap": "Clockwerk",
  "shredder": "Timbersaw",
  "skeleton king": "Wraith King",
  "windrunner": "Windranger",
  "wisp": "Io",
  "zuus": "Zeus"
};

function canonicalHeroName(heroName: string): string {
  const normalized = normalizeHeroName(heroName);
  return heroDisplayNames[normalized] || titleizeHero(normalized);
}

function heroAsset(heroName: string): string {
  const normalized = normalizeHeroName(heroName);
  const key = heroAliases[normalized] || normalized.replace(/\s+/g, "_");
  return `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/${key}.png`;
}

function normalizeHeroName(value: string): string {
  return String(value || "")
    .replace(/^npc_dota_hero_/, "")
    .replace(/_/g, " ")
    .replace(/[’']/g, "")
    .trim()
    .toLowerCase();
}

function titleizeHero(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
