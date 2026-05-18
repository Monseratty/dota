import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Circle, Search, Sparkles } from "lucide-react";
import {
  HERO_ATTRIBUTE_LABELS,
  HERO_ATTRIBUTE_ORDER,
  HEROES,
  heroImage,
  normalizeHeroText,
  type HeroAttribute,
  type HeroMeta
} from "../lib/heroes";
import { loadHeroAnalytics } from "../lib/loadHeroAnalytics";
import type { HeroStats } from "../lib/heroStats";

type AttributeFilter = "all" | HeroAttribute;

export function HeroesPage() {
  const [query, setQuery] = useState("");
  const [attribute, setAttribute] = useState<AttributeFilter>("all");
  const [stats, setStats] = useState<Map<string, HeroStats>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadHeroAnalytics()
      .then((data) => {
        setStats(data.stats);
        setError(null);
      })
      .catch((error) => setError(error instanceof Error ? error.message : "Failed to load hero stats"))
      .finally(() => setLoading(false));
  }, []);

  const filteredHeroes = useMemo(() => {
    const normalized = normalizeHeroText(query);
    return HEROES.filter((hero) => {
      if (attribute !== "all" && hero.attribute !== attribute) {
        return false;
      }
      if (!normalized) {
        return true;
      }
      return normalizeHeroText(hero.name).includes(normalized) || normalizeHeroText(hero.key).includes(normalized);
    });
  }, [attribute, query]);

  const groupedHeroes = useMemo(() => {
    const groups = new Map<HeroAttribute, HeroMeta[]>();
    for (const attr of HERO_ATTRIBUTE_ORDER) {
      groups.set(attr, []);
    }
    for (const hero of filteredHeroes) {
      groups.get(hero.attribute)?.push(hero);
    }
    return groups;
  }, [filteredHeroes]);

  const indexedMatches = useMemo(() => {
    let total = 0;
    for (const item of stats.values()) {
      total += item.matches;
    }
    return total;
  }, [stats]);

  return (
    <div className="page heroesPage cosmicHeroesPage">
        <header className="page-head hero-index-head">
          <div className="head-title">
            <div className="eyebrow">Hero Index</div>
            <h1>Heroes<em>.</em></h1>
            <p>Pick a hero like in Dota, then inspect local match history, winrate and builds from parsed replays.</p>
          </div>
          <div className="head-meta">
            <span className="live">{loading ? "INDEX · LOADING" : "INDEX · READY"}</span>
            <span>{filteredHeroes.length}/{HEROES.length} shown</span>
            <span>{indexedMatches} hero appearances</span>
          </div>
        </header>

        <section className="stats heroIndexStats" aria-label="Hero index overview">
          <HeroIndexStat label="All heroes" value={HEROES.length} delta="Dota pool" />
          <HeroIndexStat label="Shown" value={filteredHeroes.length} delta={attribute === "all" ? "all attributes" : HERO_ATTRIBUTE_LABELS[attribute]} />
          <HeroIndexStat label="With matches" value={[...stats.values()].filter((item) => item.matches > 0).length} delta="from parsed data" />
          <HeroIndexStat label="Appearances" value={indexedMatches} delta="total samples" compact={indexedMatches >= 1000} />
        </section>

        <div className="toolbar heroToolbar">
          <label className="search heroCenterSearch" data-suck>
            <Search size={18} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} autoFocus placeholder="Search hero by English name" />
            <span className="search-hint">hero</span>
          </label>
        </div>

        <div className="filters heroAttributeTabs" aria-label="Hero attribute filter">
        <span className="filters-label">Attribute</span>
        <button className={`chip ${attribute === "all" ? "active" : ""}`} data-suck onClick={() => setAttribute("all")} type="button">
          <Sparkles size={16} />
          All
          <span className="chip-count">{HEROES.length}</span>
        </button>
        {HERO_ATTRIBUTE_ORDER.map((attr) => (
          <button className={`chip attributeChip ${attribute === attr ? "active" : ""} ${attr}`} data-suck key={attr} onClick={() => setAttribute(attr)} type="button">
            <AttributeIcon attribute={attr} />
            {HERO_ATTRIBUTE_LABELS[attr]}
            <span className="chip-count">{HEROES.filter((hero) => hero.attribute === attr).length}</span>
          </button>
        ))}
        </div>

        {error ? <div className="notice danger">{error}</div> : null}

        {HERO_ATTRIBUTE_ORDER.map((attr) => {
        const heroes = groupedHeroes.get(attr) || [];
        if (heroes.length === 0) {
          return null;
        }
        return (
          <section className="heroAttributeSection" key={attr}>
            <div className="table-status heroSectionHead">
              <h2>{HERO_ATTRIBUTE_LABELS[attr]}</h2>
              <span className="right">{heroes.length} heroes</span>
            </div>
            <div className="heroGrid">
              {heroes.map((hero) => (
                <HeroCard hero={hero} key={hero.key} loading={loading} stats={stats.get(hero.key)} />
              ))}
            </div>
          </section>
        );
        })}

        {!loading && filteredHeroes.length === 0 ? (
          <div className="emptyState">
            <strong>No heroes found.</strong>
            <button className="chip-clear" onClick={() => setQuery("")} type="button">clear search</button>
          </div>
        ) : null}
    </div>
  );
}

function HeroIndexStat({ compact = false, delta, label, value }: { compact?: boolean; delta: string; label: string; value: number | string }) {
  return (
    <div className="stat" data-suck>
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={compact ? { fontSize: 28, paddingTop: 6 } : undefined}>{value}</div>
      <div className="stat-delta">{delta}</div>
    </div>
  );
}

function HeroCard({ hero, loading, stats }: { hero: HeroMeta; loading: boolean; stats?: HeroStats }) {
  const matches = stats?.matches || 0;
  const winRate = stats?.winRate == null ? "-" : `${stats.winRate}%`;

  return (
    <Link className={`heroPickCard cosmicHeroCard ${hero.attribute}`} data-suck="strong" to={`/heroes/${hero.key}`}>
      <img src={heroImage(hero.key)} alt="" />
      <div className="heroPickShade" />
      <div className="heroPickInfo">
        <strong>{hero.name}</strong>
        <span><AttributeIcon attribute={hero.attribute} /> {HERO_ATTRIBUTE_LABELS[hero.attribute]}</span>
      </div>
      <div className="heroPickStats">
        <span>{loading ? "..." : `${matches} match${matches === 1 ? "" : "es"}`}</span>
        <b>{loading ? "..." : winRate}</b>
      </div>
    </Link>
  );
}

function AttributeIcon({ attribute }: { attribute: HeroAttribute }) {
  return <Circle className={`attributeIcon ${attribute}`} size={14} fill="currentColor" />;
}
