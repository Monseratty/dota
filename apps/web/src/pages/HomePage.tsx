import { useEffect, useMemo, useState } from "react";
import { Download, ExternalLink, Loader2, RefreshCw, RotateCcw, Search, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { deleteMatch, downloadUrl, getMatches, getStorageInfo, reparseMatch, rescanFolder, type MatchListItem, type StorageInfo } from "../api/client";

export function HomePage() {
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [matches, setMatches] = useState<MatchListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [rescanning, setRescanning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | MatchListItem["status"]>("all");

  async function refresh() {
    const [nextStorage, nextMatches] = await Promise.all([getStorageInfo(), getMatches()]);
    setStorage(nextStorage);
    setMatches(nextMatches);
  }

  useEffect(() => {
    refresh()
      .catch((error) => setMessage(error.message))
      .finally(() => setLoading(false));

    const timer = window.setInterval(() => {
      refresh().catch(() => undefined);
    }, 5000);

    return () => window.clearInterval(timer);
  }, []);

  const totals = useMemo(() => {
    return {
      all: matches.length,
      queued: matches.filter((match) => match.status === "queued").length,
      ready: matches.filter((match) => match.status === "ready").length,
      failed: matches.filter((match) => match.status === "failed").length
    };
  }, [matches]);

  const filteredMatches = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return matches.filter((match) => {
      const statusMatches = statusFilter === "all" || match.status === statusFilter;
      if (!statusMatches) {
        return false;
      }
      if (!normalized) {
        return true;
      }

      return [
        match.matchId,
        match.sourceFilename,
        match.winner,
        match.status,
        match.errorMessage
      ].some((value) => String(value || "").toLowerCase().includes(normalized));
    });
  }, [matches, query, statusFilter]);

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
    await deleteMatch(match.id);
    await refresh();
  }

  async function handleReparse(match: MatchListItem) {
    await reparseMatch(match.id);
    await refresh();
  }

  return (
    <div className="page">
      <header className="pageHeader">
        <div>
          <span className="eyebrow">Watch folder MVP</span>
          <h1>Replay inbox</h1>
        </div>
        <button className="primaryButton" onClick={handleRescan} disabled={rescanning}>
          {rescanning ? <Loader2 className="spin" size={17} /> : <RefreshCw size={17} />}
          Rescan folder
        </button>
      </header>

      <section className="statusGrid">
        <Metric label="Matches" value={totals.all} />
        <Metric label="Queued" value={totals.queued} />
        <Metric label="Ready" value={totals.ready} />
        <Metric label="Failed" value={totals.failed} danger={totals.failed > 0} />
      </section>

      <section className="panel">
        <div className="panelHead">
          <h2>Local storage</h2>
          <span>{storage ? "active" : "loading"}</span>
        </div>
        <div className="pathGrid">
          <PathLabel label="Inbox" value={storage?.inboxPath} />
          <PathLabel label="Raw demos" value={storage?.rawDemoPath} />
          <PathLabel label="Parsed" value={storage?.parsedPath} />
          <PathLabel label="Database" value={storage?.databasePath} />
        </div>
      </section>

      {message ? <div className="notice">{message}</div> : null}

      <section className="panel">
        <div className="panelHead">
          <h2>Matches</h2>
          <span>{loading ? "loading" : `${filteredMatches.length}/${matches.length} shown`}</span>
        </div>
        <div className="tableToolbar">
          <label className="searchField">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search match, file, status" />
          </label>
          <div className="segmentedControl" aria-label="Filter matches by status">
            {(["all", "queued", "parsing", "ready", "failed"] as const).map((status) => (
              <button
                className={statusFilter === status ? "active" : ""}
                key={status}
                onClick={() => setStatusFilter(status)}
                type="button"
              >
                {status}
              </button>
            ))}
          </div>
        </div>
        <div className="matchTable">
          <div className="matchRow head">
            <span>File</span>
            <span>Status</span>
            <span>Size</span>
            <span>Discovered</span>
            <span>Actions</span>
          </div>
          {filteredMatches.map((match) => (
            <div className="matchRow" key={match.id}>
              <div className="matchIdentity">
                <strong>{match.matchId || match.sourceFilename}</strong>
                <small>
                  {match.winner ? `${match.winner} won` : match.sourceFilename}
                  {match.radiantScore != null && match.direScore != null ? ` · ${match.radiantScore} - ${match.direScore}` : ""}
                </small>
              </div>
              <div className="statusStack">
                <span className={`statusPill ${match.status}`}>{match.status}</span>
                <small>{match.dashboardReady ? "dashboard ready" : "waiting data"}</small>
              </div>
              <span>{formatBytes(match.fileSize)}</span>
              <span>{formatDate(match.discoveredAt)}</span>
              <div className="rowActions">
                <Link className="iconButton" to={`/matches/${match.id}`} title="Open match">
                  <ExternalLink size={16} />
                </Link>
                {match.downloadUrl ? (
                  <a className="iconButton" href={downloadUrl(match.downloadUrl)} title="Download replay">
                    <Download size={16} />
                  </a>
                ) : null}
                {match.hasRawDemo ? (
                  <button className="iconButton" onClick={() => handleReparse(match)} title="Reparse match">
                    <RotateCcw size={16} />
                  </button>
                ) : null}
                <button className="iconButton danger" onClick={() => handleDelete(match)} title="Delete match">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
          {!loading && matches.length === 0 ? <div className="emptyState">No demos imported yet. Put `.dem` files into the inbox folder.</div> : null}
          {!loading && matches.length > 0 && filteredMatches.length === 0 ? <div className="emptyState">No matches fit this filter.</div> : null}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className={`metric ${danger ? "danger" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
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

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}
