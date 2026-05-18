# Site Functionality Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the replay dashboard with shareable filters, safer public/admin behavior, better upload controls, and more usable jobs/log workflows without changing backend APIs.

**Architecture:** Keep the pass frontend-only. Use existing `/api/matches`, `/api/jobs`, upload, reparse, delete, and download contracts. Keep public and admin route behavior separated in React components and add UI-only state where possible.

**Tech Stack:** React 19, React Router 7, Vite, TypeScript, existing CSS system in `apps/web/src/styles/app.css`.

---

## File Map

- `apps/web/src/pages/HomePage.tsx`: URL query sync, quick filters, clickable match tags, clearer public match actions.
- `apps/web/src/pages/MatchPage.tsx`: public non-ready guard, copy match link/id, section anchors, safer `Remove raw`.
- `apps/web/src/pages/JobsPage.tsx`: local search/filtering, selected row state, copy log.
- `apps/web/src/pages/UploadPage.tsx`: rejected-file notice, duplicate detection, remove/retry controls, post-upload links.
- `apps/web/src/styles/app.css`: styles for filter chips, action links, copy/anchor UI, upload/job state controls.

## Task 1: Public Match List Functionality

**Files:**
- Modify: `apps/web/src/pages/HomePage.tsx`
- Modify: `apps/web/src/styles/app.css`

- [ ] Add React Router query-state imports:

```ts
import { Link, useSearchParams } from "react-router-dom";
```

- [ ] Add local filter state:

```ts
type QuickFilter = "pro" | "radiant" | "dire" | "downloadable";
const [searchParams, setSearchParams] = useSearchParams();
const [quickFilters, setQuickFilters] = useState<QuickFilter[]>([]);
```

- [ ] Initialize `query`, `sortMode`, `statusFilter`, and quick filters from URL params. Persist changes back to URL using `setSearchParams`.

- [ ] Extend `filteredMatches` with quick filters:

```ts
if (quickFilters.includes("pro") && (match.proPlayers || []).length === 0) return false;
if (quickFilters.includes("radiant") && String(match.winner).toLowerCase() !== "radiant") return false;
if (quickFilters.includes("dire") && String(match.winner).toLowerCase() !== "dire") return false;
if (quickFilters.includes("downloadable") && !match.downloadUrl) return false;
```

- [ ] Render quick filter buttons below the search toolbar and make hero/pro tags clickable by setting `query` to the tag value.

- [ ] Make public list actions clearer: keep open and download actions explicit, add text labels for desktop where layout allows.

## Task 2: Match Detail Functionality

**Files:**
- Modify: `apps/web/src/pages/MatchPage.tsx`
- Modify: `apps/web/src/styles/app.css`

- [ ] Add `notice`, `pendingAction`, and copy helpers.

```ts
const [notice, setNotice] = useState<string | null>(null);
const [pendingAction, setPendingAction] = useState<string | null>(null);
```

- [ ] If public route loads a match whose status is not `ready`, render a public-safe unavailable state with a `Back to matches` link.

- [ ] Add copy buttons for match id and current link using `navigator.clipboard.writeText`.

- [ ] Add anchors after match hero:

```tsx
<nav className="matchSubnav" aria-label="Match sections">
  <a href="#summary">Summary</a>
  <a href="#players">Players</a>
  <a href="#timeline">Timeline</a>
  <a href="#builds">Builds</a>
</nav>
```

- [ ] Add `id` attributes to dashboard sections.

- [ ] Add confirm, pending disabled state, success/error notice to `Remove raw`.

## Task 3: Jobs Page Functionality

**Files:**
- Modify: `apps/web/src/pages/JobsPage.tsx`
- Modify: `apps/web/src/styles/app.css`

- [ ] Add search state and status filter state.

```ts
const [query, setQuery] = useState("");
const [statusFilter, setStatusFilter] = useState<"all" | ParseJob["status"]>("all");
```

- [ ] Filter jobs by status and search across job id, match id, raw path, and error message.

- [ ] Render status segmented controls with counts and a search box above the jobs table.

- [ ] Mark the selected job row with `.selected`.

- [ ] Add `Copy log` button using `navigator.clipboard.writeText(log.text)`.

## Task 4: Upload Queue Functionality

**Files:**
- Modify: `apps/web/src/pages/UploadPage.tsx`
- Modify: `apps/web/src/styles/app.css`

- [ ] Show a notice for rejected non-`.dem` files.

- [ ] Deduplicate files by `name:size` and show a notice when duplicates are skipped.

- [ ] Add remove action for `idle` and `failed` entries.

- [ ] Add retry action for failed entries by reusing the single-entry upload flow.

- [ ] Store `matchId` and `jobId` on successful entries and render links to `/admin/matches/:id` and `/admin/jobs`.

## Task 5: Verification

**Files:**
- Verify all modified files.

- [ ] Run typecheck:

```bash
npm run typecheck
```

- [ ] Run production build:

```bash
npm run build
```

- [ ] Run environment doctor:

```bash
npm run doctor
```

- [ ] Browser smoke:

```text
/matches
/matches?q=Satanic&quick=pro&sort=score
/matches/:id
/admin/login
/admin/jobs
/admin/upload
```

- [ ] Confirm public pages do not show admin-only controls.
