import { Fragment, useEffect, useState, type ReactNode } from "react";
import { ArchiveX, CalendarDays, Clock3, Copy, Download, RefreshCw, RotateCcw, Swords, Trophy } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { deleteRawReplay, downloadUrl, getDashboard, getMatch, getMatchDetails, reparseMatch, type MatchListItem, type ParseJob } from "../api/client";

export function MatchPage({ admin = false }: { admin?: boolean }) {
  const { id } = useParams();
  const [match, setMatch] = useState<MatchListItem | null>(null);
  const [latestJob, setLatestJob] = useState<ParseJob | null>(null);
  const [dashboard, setDashboard] = useState<any | null>(null);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [reparsing, setReparsing] = useState(false);

  async function loadMatch(nextId: string) {
    const [details, nextDashboard] = await Promise.all([
      admin ? getMatchDetails(nextId) : getMatch(nextId).then((nextMatch) => ({ match: nextMatch, latestJob: null })),
      getDashboard(nextId)
        .then((data) => {
          setDashboardError(null);
          return data;
        })
        .catch((err) => {
          setDashboardError(err instanceof Error ? err.message : "Dashboard data is not available");
          return null;
        })
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
    setDashboardError(null);
    setNotice(null);
    try {
      await reparseMatch(match.id);
      await loadMatch(id);
      setNotice("Reparse queued.");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Reparse failed");
      setReparsing(false);
    }
  }

  async function handleDeleteRaw() {
    if (!id || !match) return;
    if (!window.confirm(`Remove raw replay for ${match.matchId || match.sourceFilename}? Parsed stats will stay available.`)) {
      return;
    }
    setPendingAction("removeRaw");
    setNotice(null);
    try {
      await deleteRawReplay(match.id);
      await loadMatch(id);
      setNotice("Raw replay removed. Parsed dashboard data is still available.");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Failed to remove raw replay");
    } finally {
      setPendingAction(null);
    }
  }

  async function copyText(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(`${label} copied.`);
    } catch {
      setNotice("Copy failed. Browser clipboard access is unavailable.");
    }
  }

  if (error) {
    return (
      <div className="page matchDetailsPage">
        <div className="notice danger">{error}</div>
      </div>
    );
  }

  if (!match) {
    return (
      <div className="page matchDetailsPage">
        <div className="loadingBlock">
          <RefreshCw className="spin" />
          Loading match
        </div>
      </div>
    );
  }

  if (!admin && match.status !== "ready") {
    return (
      <div className="page matchDetailsPage">
        <header className="page-head matchOrbitHeader">
          <div className="head-title matchTitleBlock">
            <div className="eyebrow">Match details</div>
            <h1>{match.matchId || "Match unavailable"}<em>.</em></h1>
            <p>This match is not published yet.</p>
          </div>
          <div className="head-meta headerActions matchHeaderActions">
            <Link className="btn ghostButton" data-suck="strong" to="/matches">Back to matches</Link>
          </div>
        </header>
        <section className="panel">
          <div className="panelHead">
            <h2>Not published</h2>
            <span>{match.status}</span>
          </div>
          <div className="emptyState">
            <strong>Dashboard is not ready for public view.</strong>
            <span>Only fully parsed matches are visible in the public archive.</span>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className={`page matchDetailsPage ${teamClass(match.winner)}`}>
      <header className="page-head matchOrbitHeader">
        <div className="head-title matchTitleBlock">
          <div className="eyebrow">Match details</div>
          <h1>{match.matchId || match.sourceFilename}<em>.</em></h1>
          <p>{admin ? `${match.sourceFilename} · ${formatBytes(match.fileSize)}` : publicMatchSubtitle(match)}</p>
        </div>
        <div className="head-meta headerActions matchHeaderActions">
          {match.downloadUrl ? (
            <a className="btn primaryButton" data-suck="strong" href={downloadUrl(match.downloadUrl)}>
              <Download size={17} />
              Download replay
            </a>
          ) : (
            <button className="btn primaryButton" disabled>
              <Download size={17} />
              Replay unavailable
            </button>
          )}
          {admin && match.hasRawDemo ? (
            <button className="btn ghostButton" data-suck="strong" onClick={handleReparse} disabled={reparsing || match.status === "queued" || match.status === "parsing"}>
              <RotateCcw className={reparsing ? "spin" : ""} size={17} />
              {reparsing || match.status === "queued" || match.status === "parsing" ? "Reparsing" : "Reparse"}
            </button>
          ) : null}
          {admin && match.hasRawDemo ? (
            <button className="btn ghostButton" data-suck="strong" onClick={handleDeleteRaw} disabled={pendingAction === "removeRaw"}>
              <ArchiveX size={17} />
              {pendingAction === "removeRaw" ? "Removing" : "Remove raw"}
            </button>
          ) : null}
          <button className="btn ghostButton compactAction" data-suck="strong" onClick={() => copyText(match.matchId || match.sourceFilename, "Match ID")} type="button">
            <Copy size={16} />
            Copy ID
          </button>
          <Link className="btn ghostButton" data-suck="strong" to={admin ? "/admin/matches" : "/matches"}>Back</Link>
        </div>
      </header>

      <section className="stats matchHero matchOrbitStats">
        <HeroMetric icon={<Swords size={22} />} label="Score" value={scoreText(match)} tone="major" />
        <HeroMetric icon={<Trophy size={22} />} label="Winner" value={match.winner || "unknown"} tone={teamClass(match.winner)} />
        <HeroMetric icon={<Clock3 size={22} />} label="Duration" value={match.duration ? formatDuration(match.duration) : "unknown"} tone="major" />
        <HeroMetric icon={<CalendarDays size={22} />} label="Game date" value={formatShortDate(match.discoveredAt)} />
      </section>

      <nav className="matchSubnav" aria-label="Match sections">
        <a href="#summary">Summary</a>
        <a href="#timeline">Timeline</a>
        <a href="#builds">Builds</a>
      </nav>

      {notice ? <div className={`notice ${notice.toLowerCase().includes("failed") ? "danger" : ""}`}>{notice}</div> : null}

      {admin && latestJob ? (
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
          <Link to="/admin/jobs">All jobs</Link>
          {latestJob.errorMessage ? <p title={latestJob.errorMessage}>{latestJob.errorMessage}</p> : null}
        </section>
      ) : null}

      {dashboard ? <DashboardView dashboard={dashboard} match={match} /> : (
        <section className="panel">
          <div className="panelHead">
            <h2>Dashboard data</h2>
            <span>{match.status === "ready" ? "loading dashboard" : "waiting for parser"}</span>
          </div>
          <div className="emptyState">
            <strong>{match.status === "ready" && dashboardError ? "Dashboard failed to load." : match.status === "ready" ? "Dashboard is being refreshed." : "Parser is filling this page."}</strong>
            <span>{match.status === "ready" && dashboardError ? dashboardError : match.status === "ready" ? "Player rows, item slots and builds will appear here shortly." : "Players, heroes, item timings, final inventory and ability build are not ready yet."}</span>
            <button className="textButton" onClick={() => id ? loadMatch(id) : undefined} type="button">Retry</button>
          </div>
        </section>
      )}
    </div>
  );
}

function HeroMetric({ icon, label, value, className, tone }: { icon: ReactNode; label: string; value: string; className?: string; tone?: string }) {
  return (
    <article className={`stat matchHeroItem ${tone || ""}`} data-suck>
      <span className="matchHeroIcon">{icon}</span>
      <div>
        <span className="stat-label">{label}</span>
        <strong className={`stat-value ${className || ""}`}>{value}</strong>
      </div>
    </article>
  );
}

function DashboardView({ dashboard, match }: { dashboard: any; match: MatchListItem }) {
  const inventoryLookup = buildInventoryLookup(dashboard.finalInventory || []);
  const players = (dashboard.players || []).map((player: any) => ({
    ...player,
    inventory: inventoryLookup.byPlayerId.get(Number(player.dataPlayerId)) || inventoryLookup.byHero.get(player.hero),
    itemBuild: dashboard.itemBuilds?.[player.hero] || [],
    abilityBuild: dashboard.abilityBuilds?.[player.hero] || []
  }));
  const winnerTeam = winnerToTeam(match.winner || dashboard.match?.winner);
  const teams = [2, 3].map((team) => ({
    team,
    name: team === 2 ? "Radiant" : "Dire",
    result: winnerTeam === team ? "winner" : winnerTeam ? "loser" : "unknown",
    total: (dashboard.teamTotals || []).find((total: any) => total.team === team),
    players: players.filter((player: any) => player.team === team)
  }));
  const maxNetWorth = Math.max(1, ...players.map((player: any) => Number(player.netWorth ?? player.gold) || 0));

  return (
    <>
      <DraftStrip teams={teams} match={match} />
      <MatchInsights teams={teams} players={players} match={match} />
      <section className="panel matchOverviewPanel" id="players">
        <div className="panelHead overviewHead">
          <div>
            <h2>Противостояние</h2>
            <span>{scoreText(match)} · {match.winner ? `${match.winner} victory` : "winner unknown"}</span>
          </div>
          <div className="overviewLegend">
            <span className="legendItem winner">Победители</span>
            <span className="legendItem loser">Проигравшие</span>
          </div>
        </div>
        <div className="overviewTableWrap">
          <div className="overviewTable">
            <div className="overviewRow overviewHeader">
              <span>Герой</span>
              <span>Игрок</span>
              <span>У / С / П</span>
              <span>Ур</span>
              <span>Нетворс</span>
              <span>Доб / Deny</span>
              <span>Net</span>
              <span>Инвентарь</span>
            </div>
            {teams.map((group) => (
              <div className="overviewTeamGroup" key={group.team}>
                <div className={`overviewTeamBar ${group.name.toLowerCase()} ${group.result}`}>
                  <div>
                    <strong>{group.name}</strong>
                    <span>{group.result === "winner" ? "Победа" : group.result === "loser" ? "Поражение" : "Итог неизвестен"}</span>
                  </div>
                  <b>{group.total ? `${group.total.kills} / ${group.total.deaths} / ${group.total.assists}` : `${group.players.length} players`}</b>
                </div>
                {group.players.map((player: any) => (
                  <OverviewPlayerRow
                    key={`${player.index}-${player.hero}`}
                    player={player}
                    result={group.result}
                    maxNetWorth={maxNetWorth}
                  />
                ))}
                <div className={`overviewRow overviewTotal ${group.result}`}>
                  <span></span>
                  <strong>{group.name} total</strong>
                  <span>{group.total ? `${group.total.kills} / ${group.total.deaths} / ${group.total.assists}` : "-"}</span>
                  <span></span>
                  <span>{group.total ? formatCompactNumber(group.total.netWorth ?? group.total.gold) : "-"}</span>
                  <span>{group.total ? `${group.total.lastHits} / ${group.total.denies}` : "-"}</span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
      <TimelinePanel events={dashboard.timeline || []} />
      <section className="teamColumns compactBuilds" id="builds">
        {teams.map((group) => (
          <div className={`panel teamPanel ${group.team === 2 ? "radiant" : "dire"}`} key={group.team}>
            <div className="panelHead">
              <h2>{group.name} builds</h2>
              <span>{group.total ? `${group.total.kills}/${group.total.deaths}/${group.total.assists} · ${formatNumber(group.total.netWorth ?? group.total.gold)} net` : `${group.players.length} players`}</span>
            </div>
            <div className="playerCards">
              {group.players.map((player: any) => (
                <PlayerCard key={`${player.index}-${player.hero}`} player={player} inventory={player.inventory} />
              ))}
            </div>
          </div>
        ))}
      </section>
    </>
  );
}

function MatchInsights({ teams, players, match }: { teams: any[]; players: any[]; match: MatchListItem }) {
  const radiant = teams.find((team) => team.team === 2);
  const dire = teams.find((team) => team.team === 3);
  const radiantNet = Number(radiant?.total?.netWorth ?? radiant?.total?.gold ?? 0);
  const direNet = Number(dire?.total?.netWorth ?? dire?.total?.gold ?? 0);
  const radiantKills = Number(radiant?.total?.kills ?? match.radiantScore ?? 0);
  const direKills = Number(dire?.total?.kills ?? match.direScore ?? 0);
  const topPlayers = [...players]
    .sort((left, right) => Number(right.netWorth ?? right.gold ?? 0) - Number(left.netWorth ?? left.gold ?? 0))
    .slice(0, 4);
  const maxNetWorth = Math.max(1, ...topPlayers.map((player) => Number(player.netWorth ?? player.gold ?? 0)));
  const proPlayers = players.filter((player) => player.isPro);

  return (
    <section className="insightGrid">
      <article className="insightPanel span2">
        <div className="insightHead">
          <span>Economy control</span>
          <strong>{formatCompactNumber(radiantNet + direNet)} total net</strong>
        </div>
        <SplitBar
          leftLabel="Radiant"
          leftValue={radiantNet}
          rightLabel="Dire"
          rightValue={direNet}
          leftClass="radiant"
          rightClass="dire"
        />
        <div className="insightFoot">
          <span>Radiant {formatCompactNumber(radiantNet)}</span>
          <span>Dire {formatCompactNumber(direNet)}</span>
        </div>
      </article>

      <article className="insightPanel">
        <div className="insightHead">
          <span>Kill pressure</span>
          <strong>{scoreText(match)}</strong>
        </div>
        <SplitBar
          leftLabel="Radiant"
          leftValue={radiantKills}
          rightLabel="Dire"
          rightValue={direKills}
          leftClass="radiant"
          rightClass="dire"
        />
        <div className="insightFoot">
          <span>{radiantKills} radiant kills</span>
          <span>{direKills} dire kills</span>
        </div>
      </article>

      <article className="insightPanel">
        <div className="insightHead">
          <span>Pro presence</span>
          <strong>{proPlayers.length}/10</strong>
        </div>
        <div className="proPresence">
          {proPlayers.length > 0 ? proPlayers.map((player) => (
            <span key={`${player.index}-${player.displayName || player.name}`} title={`${playerDisplayName(player)} · ${heroDisplayName(player)}`}>
              <b>{playerDisplayName(player)}</b>
              <small>{heroDisplayName(player)}</small>
            </span>
          )) : <span>No verified pros</span>}
        </div>
      </article>

      <article className="insightPanel span2">
        <div className="insightHead">
          <span>Top net worth</span>
          <strong>{topPlayers[0] ? formatCompactNumber(topPlayers[0].netWorth ?? topPlayers[0].gold ?? 0) : "-"}</strong>
        </div>
        <div className="leaderList">
          {topPlayers.map((player) => {
            const netWorth = Number(player.netWorth ?? player.gold ?? 0);
            return (
              <div className="leaderRow" key={`${player.index}-${player.hero}`}>
                <img src={heroAsset(player.heroKey)} alt="" onError={(event) => event.currentTarget.style.display = "none"} />
                <strong>{playerDisplayName(player)}</strong>
                <span>{formatCompactNumber(netWorth)}</span>
                <i><b style={{ width: `${Math.max(5, (netWorth / maxNetWorth) * 100)}%` }} /></i>
              </div>
            );
          })}
        </div>
      </article>
    </section>
  );
}

function SplitBar({ leftClass, leftLabel, leftValue, rightClass, rightLabel, rightValue }: {
  leftClass: string;
  leftLabel: string;
  leftValue: number;
  rightClass: string;
  rightLabel: string;
  rightValue: number;
}) {
  const total = Math.max(1, leftValue + rightValue);
  const leftPercent = Math.max(3, (leftValue / total) * 100);
  const rightPercent = Math.max(3, (rightValue / total) * 100);

  return (
    <div className="splitBar" aria-label={`${leftLabel} ${leftValue}, ${rightLabel} ${rightValue}`}>
      <span className={leftClass} style={{ width: `${leftPercent}%` }} />
      <span className={rightClass} style={{ width: `${rightPercent}%` }} />
    </div>
  );
}

function DraftStrip({ teams, match }: { teams: any[]; match: MatchListItem }) {
  return (
    <section className="draftStrip" id="summary">
      {teams.map((group, index) => (
        <Fragment key={group.team}>
          {index === 1 ? (
            <div className="draftCenter">
              <span>Final score</span>
              <strong>{scoreText(match)}</strong>
              <small>{match.winner ? `${match.winner} victory` : "winner unknown"}</small>
            </div>
          ) : null}
          <div className={`draftSide ${group.name.toLowerCase()} ${group.result}`}>
            <div className="draftSideHead">
              <div>
                <span>{group.name}</span>
                <strong>{group.result === "winner" ? "Победа" : group.result === "loser" ? "Поражение" : "Итог неизвестен"}</strong>
              </div>
              <b>{group.total ? formatCompactNumber(group.total.netWorth ?? group.total.gold ?? 0) : `${group.players.length} heroes`}</b>
            </div>
            <div className="draftHeroes">
              {group.players.map((player: any) => (
                <div className="draftHero" key={`${group.team}-${player.index}-${player.hero}`}>
                  <img src={heroAsset(player.heroKey)} alt="" onError={(event) => event.currentTarget.style.display = "none"} />
                  <span>{player.level ?? "-"}</span>
                  <small>{playerDisplayName(player)}</small>
                </div>
              ))}
            </div>
          </div>
        </Fragment>
      ))}
    </section>
  );
}

function OverviewPlayerRow({ player, result, maxNetWorth }: { player: any; result: string; maxNetWorth: number }) {
  const netWorth = Number(player.netWorth ?? player.gold) || 0;
  const netWorthPercent = Math.max(5, Math.min(100, (netWorth / maxNetWorth) * 100));

  return (
    <div className={`overviewRow playerOverviewRow ${result}`}>
      <div className="overviewHero" data-label="Герой">
        <img src={heroAsset(player.heroKey)} alt="" onError={(event) => event.currentTarget.style.display = "none"} />
        <span>{player.level ?? "-"}</span>
      </div>
      <div className="overviewPlayer" data-label="Игрок">
        <Link className="playerHeroFilterLink" to={`/matches?q=${encodeURIComponent(`${playerDisplayName(player)}+${heroDisplayName(player)}`)}`}>
          {playerDisplayName(player)}
          {player.isPro ? <i className="proBadge">PRO</i> : null}
        </Link>
        <span>{heroDisplayName(player)}{player.isPro && player.proTeam ? ` · ${player.proTeam}` : ""}</span>
      </div>
      <b className="overviewKda" data-label="KDA">{player.kills ?? 0} / {player.deaths ?? 0} / {player.assists ?? 0}</b>
      <span className="overviewLevel" data-label="Ур">{player.level ?? "-"}</span>
      <div className="overviewGold" data-label="Нетворс">
        <strong>{formatCompactNumber(netWorth)}</strong>
        <span><i style={{ width: `${netWorthPercent}%` }} /></span>
      </div>
      <span className="overviewCreeps" data-label="LH/DN">{player.lastHits ?? 0} / {player.denies ?? 0}</span>
      <span className="overviewNet" data-label="Net">{formatNumber(netWorth)}</span>
      <OverviewInventory inventory={player.inventory} />
    </div>
  );
}

function OverviewInventory({ inventory }: { inventory: any }) {
  const main = fixedSlots(inventory?.main, 6, 0);
  const backpack = fixedSlots(inventory?.backpack, 3, 6);
  const extra = [inventory?.tp?.[0], inventory?.neutral?.[0], inventory?.enhancement?.[0]].filter(Boolean);

  return (
    <div className="overviewInventory" aria-label="Inventory">
      <div className="overviewMainSlots">
        {main.map((item: any, index: number) => (
          <OverviewItemSlot item={item} key={`main-${index}`} />
        ))}
      </div>
      <div className="overviewExtraSlots">
        {backpack.map((item: any, index: number) => (
          <OverviewItemSlot item={item} key={`backpack-${index}`} muted />
        ))}
        {extra.map((item: any, index: number) => (
          <OverviewItemSlot item={item} key={`extra-${index}`} special />
        ))}
      </div>
    </div>
  );
}

function OverviewItemSlot({ item, muted = false, special = false }: { item: any; muted?: boolean; special?: boolean }) {
  const empty = !item?.key;

  return (
    <span className={`overviewItemSlot ${muted ? "muted" : ""} ${special ? "special" : ""} ${empty ? "empty" : ""}`} title={item?.name || "Empty"}>
      {empty ? null : <img src={itemAsset(item.key)} alt="" onError={(event) => event.currentTarget.style.display = "none"} />}
    </span>
  );
}

function buildInventoryLookup(rows: any[]): { byHero: Map<string, any>; byPlayerId: Map<number, any> } {
  const byHero = new Map<string, any>();
  const byPlayerId = new Map<number, any>();

  for (const row of rows) {
    if (!row?.hero) {
      continue;
    }

    const current = byHero.get(row.hero);
    if (!current || inventoryScore(row) > inventoryScore(current)) {
      byHero.set(row.hero, row);
    }

    if (row.playerId != null) {
      const playerId = Number(row.playerId);
      const currentForPlayer = byPlayerId.get(playerId);
      if (!currentForPlayer || inventoryScore(row) > inventoryScore(currentForPlayer)) {
        byPlayerId.set(playerId, row);
      }
    }
  }

  return { byHero, byPlayerId };
}

function inventoryScore(inventory: any): number {
  return [
    ...(inventory?.main || []),
    ...(inventory?.backpack || []),
    ...(inventory?.tp || []),
    ...(inventory?.neutral || []),
    ...(inventory?.enhancement || [])
  ].filter((item: any) => item?.key).length;
}

function TimelinePanel({ events }: { events: any[] }) {
  const important = events
    .filter((event) => event.type !== "kill" || event.time <= 900 || event.time >= 1800)
    .slice(0, 14);

  if (important.length === 0) {
    return null;
  }

  return (
    <section className="panel timelinePanel" id="timeline">
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
  const itemBuild = (player.itemBuild || []).filter((item: any) => !String(item.key || "").startsWith("recipe_"));
  const abilityBuild = (player.abilityBuild || []).slice(0, 10);
  const itemPhases = buildItemPhases(itemBuild);

  return (
    <article className="playerCard">
      <header>
        <img src={heroAsset(player.heroKey)} alt="" />
        <div>
          <strong>
            {playerDisplayName(player)}
            {player.isPro ? <i className="proBadge">PRO</i> : null}
          </strong>
          <span>{heroDisplayName(player)}{player.isPro && player.proTeam ? ` · ${player.proTeam}` : ""}</span>
        </div>
        <b>{player.kills}/{player.deaths}/{player.assists}</b>
      </header>
      <div className="smallStats">
        <span>LH {player.lastHits ?? 0}</span>
        <span>DN {player.denies ?? 0}</span>
        <span>Net {formatNumber(player.netWorth ?? player.gold ?? 0)}</span>
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
      <div className="itemPhaseStack">
        {itemPhases.map((phase) => (
          <div className="buildLine itemLine phaseLine" key={phase.label}>
            <span className="lineLabel">{phase.label}</span>
            <div className="buildTrack">
              {phase.items.length > 0 ? phase.items.map((item: any, index: number) => (
                <BuildIcon
                  key={`${phase.label}-${item.key}-${item.time}-${index}`}
                  src={itemAsset(item.key)}
                  label={`${formatGameTime(item.time)} · ${item.name}`}
                  time={formatGameTime(item.time)}
                />
              )) : <span className="phaseEmpty">No purchases</span>}
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

function buildItemPhases(items: any[]): Array<{ label: string; items: any[] }> {
  const phases = [
    { label: "0-5", min: 0, max: 300, limit: 8 },
    { label: "5-10", min: 301, max: 600, limit: 8 },
    { label: "10-15", min: 601, max: 900, limit: 8 },
    { label: "15+", min: 901, max: Number.POSITIVE_INFINITY, limit: 12 }
  ];

  return phases.map((phase) => ({
    label: phase.label,
    items: items
      .filter((item: any) => {
        const time = Number(item.time);
        return Number.isFinite(time) && time >= phase.min && time <= phase.max;
      })
      .filter((item: any, index: number, all: any[]) => {
        if (phase.label !== "15+") {
          return true;
        }
        const key = String(item.key || "");
        return all.findIndex((other) => String(other.key || "") === key) === index;
      })
      .slice(0, phase.limit)
  }));
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

function playerDisplayName(player: any): string {
  return player.displayName || player.name || heroDisplayName(player);
}

function heroDisplayName(player: any): string {
  const raw = player?.heroName || player?.heroKey || player?.hero || "";
  const normalized = normalizeHeroName(raw);
  return heroDisplayAliases[normalized] || titleizeHero(normalized);
}

const heroDisplayAliases: Record<string, string> = {
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

const itemAliases: Record<string, string> = {
  assault_cuirass: "assault",
  battlefury: "bfury",
  blink_dagger: "blink",
  boots_of_travel: "travel_boots",
  boots_of_travel_2: "travel_boots_2",
  chain_mail: "chainmail",
  cranium_basher: "basher",
  dagon_upgraded: "dagon_5",
  divine_rapier: "rapier",
  empty_bottle: "bottle",
  enhancement_timelss: "enhancement_timeless",
  gem_of_true_sight: "gem",
  ironwood_branch: "branches",
  invisibility_edge: "silver_edge",
  moonshard: "moon_shard",
  observer_ward: "ward_observer",
  orchid_malevolence: "orchid",
  perseverance: "pers",
  plate_mail: "platemail",
  refresher_orb: "refresher",
  sentry_ward: "ward_sentry",
  sheep_stick: "sheepstick",
  splint_mail: "splintmail"
};

function itemAsset(itemKey: string): string {
  const key = itemAliases[itemKey] || itemKey;
  if (key.startsWith("recipe_")) {
    return "/assets/dota/items/recipe.png";
  }
  return `/assets/dota/items/${key}.png`;
}

function abilityAsset(abilityKey: string): string {
  return `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/abilities/${abilityKey}.png`;
}

function fixedSlots(items: any[] | undefined, count: number, startSlot: number): any[] {
  const bySlot = new Map((items || []).map((item: any, index: number) => [Number(item?.slot ?? startSlot + index), item]));
  return Array.from({ length: count }, (_, index) => bySlot.get(startSlot + index) || { slot: startSlot + index, key: null, name: null });
}

function winnerToTeam(winner: string | null | undefined): number | null {
  if (!winner) {
    return null;
  }
  const normalized = String(winner).toLowerCase();
  if (normalized === "radiant" || normalized === "2") {
    return 2;
  }
  if (normalized === "dire" || normalized === "3") {
    return 3;
  }
  return null;
}

function teamClass(winner: string | null | undefined): string {
  const team = winnerToTeam(winner);
  if (team === 2) {
    return "radiantWinner";
  }
  if (team === 3) {
    return "direWinner";
  }
  return "winnerUnknown";
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

function publicMatchSubtitle(match: MatchListItem): string {
  const parts = [
    match.winner ? `${match.winner} victory` : "winner unknown",
    scoreText(match),
    match.duration ? formatDuration(match.duration) : null,
    formatShortDate(match.discoveredAt)
  ].filter(Boolean);

  return parts.join(" · ");
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatCompactNumber(value: number): string {
  if (Math.abs(value) >= 1000) {
    return `${(value / 1000).toFixed(value >= 10000 ? 1 : 2)}k`;
  }
  return formatNumber(value);
}

function formatGameTime(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds || 0));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

function formatDuration(seconds: number): string {
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

function formatShortDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}
