import { useEffect, useState } from "react";
import { ArchiveX, Download, RefreshCw, RotateCcw } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { deleteRawReplay, downloadUrl, getDashboard, getMatchDetails, reparseMatch, type MatchListItem, type ParseJob } from "../api/client";

export function MatchPage() {
  const { id } = useParams();
  const [match, setMatch] = useState<MatchListItem | null>(null);
  const [latestJob, setLatestJob] = useState<ParseJob | null>(null);
  const [dashboard, setDashboard] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reparsing, setReparsing] = useState(false);

  async function loadMatch(nextId: string) {
    const [details, nextDashboard] = await Promise.all([
      getMatchDetails(nextId),
      getDashboard(nextId).catch(() => null)
    ]);
    setMatch(details.match);
    setLatestJob(details.latestJob);
    setDashboard(nextDashboard);
  }

  useEffect(() => {
    if (!id) return;
    loadMatch(id)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load match"));
  }, [id]);

  useEffect(() => {
    if (!id || !match) return;
    const needsRefresh = reparsing || match.status === "queued" || match.status === "parsing" || (match.status === "ready" && !dashboard);
    if (!needsRefresh) return;

    const timer = window.setInterval(() => {
      loadMatch(id).catch(() => undefined);
    }, 2000);

    return () => window.clearInterval(timer);
  }, [id, match?.status, dashboard, reparsing]);

  useEffect(() => {
    if (match?.status === "ready" && dashboard) {
      setReparsing(false);
    }
  }, [match?.status, dashboard]);

  async function handleReparse() {
    if (!id || !match) return;
    setReparsing(true);
    setDashboard(null);
    await reparseMatch(match.id);
    await loadMatch(id);
  }

  async function handleDeleteRaw() {
    if (!id || !match) return;
    await deleteRawReplay(match.id);
    await loadMatch(id);
  }

  if (error) {
    return (
      <div className="page">
        <div className="notice danger">{error}</div>
      </div>
    );
  }

  if (!match) {
    return (
      <div className="page">
        <div className="loadingBlock">
          <RefreshCw className="spin" />
          Loading match
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="pageHeader">
        <div>
          <span className="eyebrow">Match details</span>
          <h1>{match.matchId || match.sourceFilename}</h1>
        </div>
        <div className="headerActions">
          {match.downloadUrl ? (
            <a className="primaryButton" href={downloadUrl(match.downloadUrl)}>
              <Download size={17} />
              Download replay
            </a>
          ) : (
            <button className="primaryButton" disabled>
              <Download size={17} />
              Replay unavailable
            </button>
          )}
          {match.hasRawDemo ? (
            <button className="ghostButton" onClick={handleReparse} disabled={reparsing || match.status === "queued" || match.status === "parsing"}>
              <RotateCcw className={reparsing ? "spin" : ""} size={17} />
              {reparsing || match.status === "queued" || match.status === "parsing" ? "Reparsing" : "Reparse"}
            </button>
          ) : null}
          {match.hasRawDemo ? (
            <button className="ghostButton" onClick={handleDeleteRaw}>
              <ArchiveX size={17} />
              Remove raw
            </button>
          ) : null}
          <Link className="ghostButton" to="/matches">Back</Link>
        </div>
      </header>

      <section className="matchHero">
        <div>
          <span>Status</span>
          <strong className={`statusText ${match.status}`}>{match.status}</strong>
        </div>
        <div>
          <span>Score</span>
          <strong>{scoreText(match)}</strong>
        </div>
        <div>
          <span>Winner</span>
          <strong>{match.winner || "unknown"}</strong>
        </div>
        <div>
          <span>Raw replay</span>
          <strong>{match.hasRawDemo ? "available" : "missing"}</strong>
        </div>
        <div>
          <span>File size</span>
          <strong>{formatBytes(match.fileSize)}</strong>
        </div>
        <div>
          <span>Discovered</span>
          <strong>{formatDate(match.discoveredAt)}</strong>
        </div>
      </section>

      {latestJob ? (
        <section className="jobSummary">
          <div>
            <span>Latest job</span>
            <strong>#{latestJob.id}</strong>
          </div>
          <div>
            <span>Status</span>
            <strong className={`statusText ${latestJob.status}`}>{latestJob.status}</strong>
          </div>
          <div>
            <span>Attempts</span>
            <strong>{latestJob.attempts}</strong>
          </div>
          <div>
            <span>Started</span>
            <strong>{latestJob.startedAt ? formatDate(latestJob.startedAt) : "-"}</strong>
          </div>
          <div>
            <span>Finished</span>
            <strong>{latestJob.finishedAt ? formatDate(latestJob.finishedAt) : "-"}</strong>
          </div>
          <Link to="/jobs">All jobs</Link>
          {latestJob.errorMessage ? <p title={latestJob.errorMessage}>{latestJob.errorMessage}</p> : null}
        </section>
      ) : null}

      {dashboard ? <DashboardView dashboard={dashboard} /> : (
        <section className="panel">
          <div className="panelHead">
            <h2>Dashboard data</h2>
            <span>{match.status === "ready" ? "loading dashboard" : "waiting for parser"}</span>
          </div>
          <div className="emptyState">
            {match.status === "ready" ? "Dashboard is being refreshed..." : "Parser worker is filling this page with players, heroes, item timings, final inventory and ability build."}
          </div>
        </section>
      )}
    </div>
  );
}

function DashboardView({ dashboard }: { dashboard: any }) {
  const inventoryByHero = new Map((dashboard.finalInventory || []).map((row: any) => [row.hero, row]));
  const players = (dashboard.players || []).map((player: any) => ({
    ...player,
    itemBuild: dashboard.itemBuilds?.[player.hero] || [],
    abilityBuild: dashboard.abilityBuilds?.[player.hero] || []
  }));
  const teams = [2, 3].map((team) => ({
    team,
    name: team === 2 ? "Radiant" : "Dire",
    total: (dashboard.teamTotals || []).find((total: any) => total.team === team),
    players: players.filter((player: any) => player.team === team)
  }));

  return (
    <>
      <TimelinePanel events={dashboard.timeline || []} />
      <section className="teamColumns">
        {teams.map((group) => (
          <div className={`panel teamPanel ${group.team === 2 ? "radiant" : "dire"}`} key={group.team}>
            <div className="panelHead">
              <h2>{group.name}</h2>
              <span>{group.total ? `${group.total.kills}/${group.total.deaths}/${group.total.assists} · ${formatNumber(group.total.gold)} gold` : `${group.players.length} players`}</span>
            </div>
            <div className="playerCards">
              {group.players.map((player: any) => (
                <PlayerCard key={`${player.index}-${player.hero}`} player={player} inventory={inventoryByHero.get(player.hero)} />
              ))}
            </div>
          </div>
        ))}
      </section>
    </>
  );
}

function TimelinePanel({ events }: { events: any[] }) {
  const important = events
    .filter((event) => event.type !== "kill" || event.time <= 900 || event.time >= 1800)
    .slice(0, 28);

  if (important.length === 0) {
    return null;
  }

  return (
    <section className="panel timelinePanel">
      <div className="panelHead">
        <h2>Timeline</h2>
        <span>{important.length} key events</span>
      </div>
      <div className="timelineList">
        {important.map((event, index) => (
          <div className={`timelineItem ${event.type} ${event.team === 2 ? "radiant" : event.team === 3 ? "dire" : ""}`} key={`${event.tick}-${event.type}-${index}`}>
            <time>{formatGameTime(event.time)}</time>
            <span>{eventLabel(event.type)}</span>
            <strong>{event.title}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function PlayerCard({ player, inventory }: { player: any; inventory: any }) {
  const itemBuild = (player.itemBuild || []).filter((item: any) => !String(item.key || "").startsWith("recipe_")).slice(0, 10);
  const abilityBuild = (player.abilityBuild || []).slice(0, 10);

  return (
    <article className="playerCard">
      <header>
        <img src={heroAsset(player.heroKey)} alt="" />
        <div>
          <strong>
            {player.displayName || player.name || player.heroName}
            {player.isPro ? <i className="proBadge">PRO</i> : null}
          </strong>
          <span>{player.heroName}{player.isPro && player.proTeam ? ` · ${player.proTeam}` : ""}</span>
        </div>
        <b>{player.kills}/{player.deaths}/{player.assists}</b>
      </header>
      <div className="smallStats">
        <span>LH {player.lastHits ?? 0}</span>
        <span>DN {player.denies ?? 0}</span>
        <span>Gold {formatNumber(player.gold ?? 0)}</span>
        <span>Lvl {player.level ?? "-"}</span>
      </div>
      {abilityBuild.length > 0 ? (
        <div className="buildLine abilityLine">
          <span className="lineLabel">Skl</span>
          <div className="buildTrack">
            {abilityBuild.map((ability: any, index: number) => (
              <BuildIcon
                key={`${ability.key}-${ability.time}-${index}`}
                src={abilityAsset(ability.key)}
                label={`${formatGameTime(ability.time)} · ${ability.name} ${ability.abilityLevel}`}
                time={ability.abilityLevel}
              />
            ))}
          </div>
        </div>
      ) : null}
      {inventory ? (
        <div className="inventoryBlock" aria-label="Inventory">
          <div className="inventoryRow main">
            <span className="lineLabel">Inv</span>
            <div className="inventorySlots">
              {(inventory.main || []).map((item: any) => <InventorySlot item={item} key={item.slot} />)}
            </div>
          </div>
          <div className="inventoryRow extra">
            <span className="lineLabel">Bp</span>
            <div className="inventorySlots">
              {[...(inventory.backpack || []), ...(inventory.tp || []), ...(inventory.neutral || []), ...(inventory.enhancement || [])].map((item: any, index: number) => (
                <InventorySlot item={item} key={`${item?.slot ?? "slot"}-${index}`} muted />
              ))}
            </div>
          </div>
        </div>
      ) : null}
      {itemBuild.length > 0 ? (
        <div className="buildLine itemLine">
          <span className="lineLabel">Itm</span>
          <div className="buildTrack">
            {itemBuild.map((item: any, index: number) => (
              <BuildIcon
                key={`${item.key}-${item.time}-${index}`}
                src={itemAsset(item.key)}
                label={`${formatGameTime(item.time)} · ${item.name}`}
                time={formatGameTime(item.time)}
              />
            ))}
          </div>
        </div>
      ) : null}
    </article>
  );
}

function BuildIcon({ src, label, time }: { src: string; label: string; time: string | number }) {
  return (
    <span className="buildIcon" title={label}>
      <img src={src} alt="" onError={(event) => event.currentTarget.style.display = "none"} />
      <small>{time}</small>
    </span>
  );
}

function InventorySlot({ item, muted = false }: { item: any; muted?: boolean }) {
  const empty = !item?.key;
  return (
    <span className={`inventorySlot ${muted ? "muted" : ""} ${empty ? "empty" : ""}`} title={item?.name || "Empty"}>
      {empty ? null : <img src={itemAsset(item.key)} alt="" />}
    </span>
  );
}

function heroAsset(heroKey: string): string {
  return `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/${heroKey}.png`;
}

const itemAliases: Record<string, string> = {
  assault_cuirass: "assault",
  blink_dagger: "blink",
  ironwood_branch: "branches",
  empty_bottle: "bottle",
  dagon_upgraded: "dagon_5"
};

function itemAsset(itemKey: string): string {
  const key = itemAliases[itemKey] || itemKey;
  if (key.startsWith("recipe_")) {
    return "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/recipe.png";
  }
  return `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/${key}.png`;
}

function abilityAsset(abilityKey: string): string {
  return `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/abilities/${abilityKey}.png`;
}

function eventLabel(type: string): string {
  const labels: Record<string, string> = {
    buyback: "Buyback",
    first_blood: "First blood",
    kill: "Kill",
    objective: "Objective"
  };
  return labels[type] || type;
}

function scoreText(match: MatchListItem): string {
  if (match.radiantScore == null || match.direScore == null) {
    return "unknown";
  }
  return `${match.radiantScore} - ${match.direScore}`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatGameTime(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds || 0));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
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
