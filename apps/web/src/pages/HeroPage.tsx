import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { Download, ExternalLink, PackageOpen, Sparkles, Swords, Trophy } from "lucide-react";
import { downloadUrl, getHeroBuildAnalytics, getHeroStats, type HeroAbilityBuildEntry, type HeroBuildAnalytics, type HeroBuildEntry } from "../api/client";
import { HERO_ATTRIBUTE_LABELS, getHeroByKey, getHeroByName, heroImage } from "../lib/heroes";
import { toHeroStats } from "../lib/loadHeroAnalytics";
import type { HeroStats } from "../lib/heroStats";

export function HeroPage() {
  const { heroKey } = useParams();
  const hero = getHeroByKey(heroKey) || getHeroByName(heroKey);
  const [stats, setStats] = useState<HeroStats | null>(null);
  const [buildAnalytics, setBuildAnalytics] = useState<HeroBuildAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hero) {
      setLoading(false);
      return;
    }

    setLoading(true);
    Promise.all([
      getHeroStats(hero.key),
      getHeroBuildAnalytics(hero.key).catch(() => null)
    ])
      .then(([nextStats, nextBuildAnalytics]) => {
        setStats(toHeroStats(nextStats));
        setBuildAnalytics(nextBuildAnalytics);
        setError(null);
      })
      .catch((error) => setError(error instanceof Error ? error.message : "Failed to load hero stats"))
      .finally(() => setLoading(false));
  }, [hero?.key]);

  const rows = useMemo(() => [...(stats?.rows || [])].sort((left, right) => {
    return timeValue(right.match.parsedAt || right.match.discoveredAt) - timeValue(left.match.parsedAt || left.match.discoveredAt);
  }), [stats]);
  const playerCombos = useMemo(() => buildPlayerHeroCombos(rows, hero?.name || ""), [rows, hero?.name]);

  if (!hero) {
    return (
      <div className="page">
        <section className="panel">
          <div className="emptyState">
            <strong>Hero not found.</strong>
            <Link className="textButton" to="/heroes">Back to heroes</Link>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className={`page heroDetailsPage cosmicHeroDetails ${hero.attribute}`}>
        <header className="page-head heroProfileHeader">
          <div className="heroProfileMedia" data-suck>
            <img src={heroImage(hero.key)} alt="" />
          </div>
          <div className="head-title">
            <div className="eyebrow">{HERO_ATTRIBUTE_LABELS[hero.attribute]}</div>
            <h1>{hero.name}<em>.</em></h1>
            <p>Local replay statistics from parsed matches, common builds and player combinations.</p>
          </div>
          <div className="head-meta">
            <span className="live">{loading ? "HERO · LOADING" : "HERO · READY"}</span>
            <span>{stats?.matches ?? 0} matches</span>
            <Link className="btn" data-suck="strong" to="/heroes">All heroes</Link>
          </div>
        </header>

        {error ? <div className="notice danger">{error}</div> : null}

        <section className="stats heroStatGrid">
          <HeroMetric label="Matches" value={loading ? "..." : stats?.matches ?? 0} />
          <HeroMetric label="Winrate" value={loading ? "..." : stats?.winRate == null ? "-" : `${stats.winRate}%`} />
          <HeroMetric label="Wins" value={loading ? "..." : stats?.wins ?? 0} good />
          <HeroMetric label="Losses" value={loading ? "..." : stats?.losses ?? 0} danger />
          <HeroMetric label="Avg KDA" value={loading ? "..." : formatKda(stats)} />
          <HeroMetric label="Avg net" value={loading ? "..." : formatCompact(stats?.avgNetWorth)} />
        </section>

        <HeroBuildAnalyticsPanel analytics={buildAnalytics} loading={loading} />

        {playerCombos.length > 0 ? (
          <section className="heroPlayerCombos">
            <div className="table-status">
              <h2>Players on {hero.name}</h2>
              <span className="right">{playerCombos.length} combinations</span>
            </div>
            <div className="comboChipRow">
              {playerCombos.map((combo) => (
                <Link className="comboChip" data-suck key={combo.player} to={`/matches?q=${encodeURIComponent(`${combo.player}+${hero.name}`)}`}>
                  <strong>{combo.player}</strong>
                  <span>{hero.name}</span>
                  <b>{combo.games} games · {combo.winRate}% WR</b>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <section className="heroMatchesPanel">
          <div className="table-status">
            <h2>Matches on {hero.name}</h2>
            <span className="right">{loading ? "loading" : `${rows.length} matches`}</span>
          </div>
          <div className="table heroMatchList">
            {loading ? (
              <div className="emptyState">Loading hero matches</div>
            ) : rows.map((row) => (
              <div className={`row heroMatchRow ${row.won ? "radiant" : "dire"}`} data-suck="strong" key={`${row.match.id}-${row.player.index}`}>
                <span className="res-bar" />
                <div className="ident">
                  <div className="ident-top">
                    <span className="match-id">{row.match.matchId || row.match.sourceFilename}</span>
                    <span className="match-meta">{formatDate(row.match.parsedAt || row.match.discoveredAt)} · {row.match.radiantScore} - {row.match.direScore} · {row.match.winner || "winner unknown"}</span>
                  </div>
                </div>
                <span className={row.won ? "heroResult won" : "heroResult lost"}>
                  {row.won ? <Trophy size={15} /> : <Swords size={15} />}
                  {row.won ? "Win" : "Loss"}
                </span>
                <b className="num">{row.player.kills ?? 0}/{row.player.deaths ?? 0}/{row.player.assists ?? 0}</b>
                <span className="num">{formatCompact(row.player.netWorth ?? row.player.gold)} net</span>
                <div className="actions">
                  <Link className="btn ghost" data-suck="strong" to={`/matches/${row.match.id}`} title="Open match">
                    <ExternalLink size={14} />
                  </Link>
                  {row.match.downloadUrl ? (
                    <a className="btn ghost" data-suck="strong" href={downloadUrl(row.match.downloadUrl)} title="Download replay">
                      <Download size={14} />
                    </a>
                  ) : null}
                </div>
              </div>
            ))}
            {!loading && rows.length === 0 ? (
              <div className="emptyState">
                <strong>No parsed matches on this hero yet.</strong>
                <span>Upload and parse demos where {hero.name} appears, then this page will fill automatically.</span>
              </div>
            ) : null}
          </div>
        </section>
    </div>
  );
}

function HeroBuildAnalyticsPanel({ analytics, loading }: { analytics: HeroBuildAnalytics | null; loading: boolean }) {
  const hasData = Boolean(analytics && analytics.appearances > 0);

  return (
    <section className="heroBuildAnalytics">
      <BuildPatternCard
        description={hasData ? `${analytics?.startingItems?.count ?? 0}/${analytics?.appearances ?? 0} matches` : "No sample yet"}
        icon={<PackageOpen size={18} />}
        loading={loading}
        title="Starting purchase"
      >
        <ItemBuildTrack items={analytics?.startingItems?.items || []} />
      </BuildPatternCard>
      <BuildPatternCard
        description={hasData ? `${analytics?.itemBuild?.count ?? 0}/${analytics?.appearances ?? 0} matches` : "No sample yet"}
        icon={<Swords size={18} />}
        loading={loading}
        title="Most frequent build"
      >
        <ItemBuildTrack items={analytics?.itemBuild?.items || []} showTime />
      </BuildPatternCard>
      <BuildPatternCard
        description={hasData ? `${analytics?.abilityBuild?.count ?? 0}/${analytics?.appearances ?? 0} matches` : "No sample yet"}
        icon={<Sparkles size={18} />}
        loading={loading}
        title="Skill build"
      >
        <AbilityBuildTrack abilities={analytics?.abilityBuild?.abilities || []} />
      </BuildPatternCard>
    </section>
  );
}

function BuildPatternCard({ children, description, icon, loading, title }: {
  children: ReactNode;
  description: string;
  icon: ReactNode;
  loading: boolean;
  title: string;
}) {
  return (
    <article className="heroBuildCard">
      <header>
        <span>{icon}</span>
        <div>
          <strong>{title}</strong>
          <small>{loading ? "loading" : description}</small>
        </div>
      </header>
      {loading ? <div className="buildEmpty">Loading build pattern</div> : children}
    </article>
  );
}

function ItemBuildTrack({ items, showTime = false }: { items: HeroBuildEntry[]; showTime?: boolean }) {
  if (items.length === 0) {
    return (
      <div className="heroBuildTrack emptySlots">
        {Array.from({ length: 5 }, (_, index) => <span className="heroBuildIcon empty" key={index} />)}
      </div>
    );
  }

  const padded = showTime ? items : [...items, ...Array.from({ length: Math.max(0, 5 - items.length) }, () => null)];

  return (
    <div className="heroBuildTrack">
      {padded.map((item, index) => item ? (
          <span className="heroBuildIcon item" key={`${item.key}-${index}`} title={`${item.name}${item.time != null ? ` · ${formatGameTime(item.time)}` : ""}`}>
            <img src={itemAsset(item.key)} alt="" onError={(event) => event.currentTarget.style.display = "none"} />
            {showTime && item.time != null ? <small>{formatGameTime(item.time)}</small> : null}
          </span>
        ) : <span className="heroBuildIcon empty" key={`empty-${index}`} />
      )}
    </div>
  );
}

function AbilityBuildTrack({ abilities }: { abilities: HeroAbilityBuildEntry[] }) {
  if (abilities.length === 0) {
    return (
      <div className="heroBuildTrack ability emptySlots">
        {Array.from({ length: 15 }, (_, index) => <span className="heroBuildIcon ability empty" key={index}><small>{index + 1}</small></span>)}
      </div>
    );
  }

  const padded = [...abilities.slice(0, 15), ...Array.from({ length: Math.max(0, 15 - abilities.length) }, () => null)];

  return (
    <div className="heroBuildTrack ability">
      {padded.map((ability, index) => ability ? (
          <span className="heroBuildIcon ability" key={`${ability.key}-${index}`} title={`${ability.name}${ability.time != null ? ` · ${formatGameTime(ability.time)}` : ""}`}>
            <img src={abilityAsset(ability.key)} alt="" onError={(event) => event.currentTarget.style.display = "none"} />
            <small>{index + 1}</small>
          </span>
        ) : <span className="heroBuildIcon ability empty" key={`empty-${index}`}><small>{index + 1}</small></span>
      )}
    </div>
  );
}

function buildPlayerHeroCombos(rows: HeroStats["rows"], heroName: string): Array<{ player: string; games: number; wins: number; winRate: number }> {
  const buckets = new Map<string, { player: string; games: number; wins: number }>();
  for (const row of rows) {
    const player = row.player.displayName || row.player.proName || "Unknown";
    const bucket = buckets.get(player) || { player, games: 0, wins: 0 };
    bucket.games += 1;
    bucket.wins += row.won ? 1 : 0;
    buckets.set(player, bucket);
  }

  return [...buckets.values()]
    .filter((bucket) => bucket.player !== "Unknown")
    .map((bucket) => ({
      ...bucket,
      winRate: bucket.games > 0 ? Math.round((bucket.wins / bucket.games) * 100) : 0
    }))
    .sort((left, right) => right.games - left.games || right.winRate - left.winRate)
    .slice(0, heroName ? 10 : 0);
}

function HeroMetric({ label, value, good, danger }: { label: string; value: string | number; good?: boolean; danger?: boolean }) {
  return (
    <article className={`stat ${good ? "good" : ""} ${danger ? "danger" : ""}`} data-suck>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </article>
  );
}

function formatKda(stats: HeroStats | null): string {
  if (!stats || stats.avgKills == null || stats.avgDeaths == null || stats.avgAssists == null) {
    return "-";
  }
  return `${stats.avgKills}/${stats.avgDeaths}/${stats.avgAssists}`;
}

function formatCompact(value: unknown): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "-";
  }
  if (Math.abs(numeric) >= 1000) {
    return `${(numeric / 1000).toFixed(numeric >= 10000 ? 1 : 2)}k`;
  }
  return new Intl.NumberFormat("en-US").format(numeric);
}

function formatGameTime(seconds: number | null): string {
  if (seconds == null) {
    return "-";
  }
  const sign = seconds < 0 ? "-" : "";
  const safe = Math.abs(Math.round(seconds));
  return `${sign}${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
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

function timeValue(value: string | null): number {
  return value ? new Date(value).getTime() : 0;
}
