import { useEffect, useMemo, useState } from "react";
import { Copy, FileText, RefreshCw, RotateCcw, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { getJobLog, getJobs, retryJob, type ParseJob, type ParserLog } from "../api/client";
import { MetricCard, TableSkeleton } from "../components/ui";

const STATUS_FILTERS = ["all", "queued", "running", "done", "failed"] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number];

export function JobsPage() {
  const [jobs, setJobs] = useState<ParseJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLog, setSelectedLog] = useState<ParserLog | null>(null);
  const [logLoadingId, setLogLoadingId] = useState<number | null>(null);
  const [retryingId, setRetryingId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  async function refresh() {
    const nextJobs = await getJobs();
    setJobs(nextJobs);
  }

  useEffect(() => {
    refresh()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load jobs"))
      .finally(() => setLoading(false));

    const timer = window.setInterval(() => {
      refresh().catch(() => undefined);
    }, 3000);

    return () => window.clearInterval(timer);
  }, []);

  const totals = useMemo(() => ({
    all: jobs.length,
    queued: jobs.filter((job) => job.status === "queued").length,
    running: jobs.filter((job) => job.status === "running").length,
    done: jobs.filter((job) => job.status === "done").length,
    failed: jobs.filter((job) => job.status === "failed").length
  }), [jobs]);

  const filteredJobs = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();

    return jobs.filter((job) => {
      const matchesStatus = statusFilter === "all" || job.status === statusFilter;
      if (!matchesStatus) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      return [
        job.id,
        job.matchId,
        job.rawFilePath,
        job.errorMessage ?? ""
      ].some((value) => String(value).toLowerCase().includes(normalizedSearch));
    });
  }, [jobs, searchQuery, statusFilter]);

  async function handleShowLog(job: ParseJob) {
    setLogLoadingId(job.id);
    setError(null);
    try {
      setSelectedLog(await getJobLog(job.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load parser log");
    } finally {
      setLogLoadingId(null);
    }
  }

  async function handleRetry(job: ParseJob) {
    setRetryingId(job.id);
    setError(null);
    try {
      await retryJob(job.id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to retry job");
    } finally {
      setRetryingId(null);
    }
  }

  async function handleCopyLog(log: ParserLog) {
    setError(null);
    try {
      await navigator.clipboard.writeText(log.text);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to copy parser log");
    }
  }

  return (
    <div className="page jobsPage">
      <header className="pageHeader">
        <div>
          <span className="eyebrow">Parser queue</span>
          <h1>Jobs</h1>
          <p>Track parsing attempts, failures and worker output.</p>
        </div>
        <button className="ghostButton" onClick={() => refresh()} disabled={loading}>
          <RefreshCw size={17} />
          Refresh
        </button>
      </header>

      <section className="statusGrid">
        <MetricCard label="Queued" value={totals.queued} />
        <MetricCard label="Running" value={totals.running} />
        <MetricCard label="Done" value={totals.done} />
        <MetricCard label="Failed" value={totals.failed} danger={totals.failed > 0} />
      </section>

      {error ? <div className="notice danger">{error}</div> : null}

      <section className="panel">
        <div className="panelHead">
          <h2>Recent parser jobs</h2>
          <span>{loading ? "loading" : `${filteredJobs.length} of ${jobs.length} latest`}</span>
        </div>
        <div className="tableToolbar">
          <label className="searchField">
            <Search size={16} />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search job, match, file or error"
            />
          </label>
          <div className="segmentedControl" aria-label="Filter jobs by status">
            {STATUS_FILTERS.map((status) => (
              <button
                className={statusFilter === status ? "active" : ""}
                key={status}
                onClick={() => setStatusFilter(status)}
                type="button"
              >
                {status}
                <span>{totals[status]}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="jobsTable">
          <div className="jobRow head">
            <span>Job</span>
            <span>Match</span>
            <span>Status</span>
            <span>Attempts</span>
            <span>Started</span>
            <span>Finished</span>
            <span>Actions</span>
          </div>
          {loading ? <TableSkeleton columns={7} rows={5} /> : null}
          {!loading && filteredJobs.map((job) => (
            <div className={`jobRow ${job.status} ${selectedLog?.jobId === job.id ? "selected" : ""}`} key={job.id}>
              <div data-label="Job">
                <strong>#{job.id}</strong>
                <small>{fileName(job.rawFilePath)}</small>
              </div>
              <Link data-label="Match" to={`/admin/matches/${job.matchId}`}>Match {job.matchId}</Link>
              <div className="statusStack" data-label="Status">
                <span className={`statusPill ${job.status}`}>{job.status}</span>
                {job.errorMessage ? <small title={job.errorMessage}>{job.errorMessage}</small> : null}
              </div>
              <span data-label="Attempts">{job.attempts}</span>
              <span data-label="Started">{job.startedAt ? formatDate(job.startedAt) : "-"}</span>
              <span data-label="Finished">{job.finishedAt ? formatDate(job.finishedAt) : "-"}</span>
              <div className="rowActions" data-label="Actions">
                <button className="iconButton" onClick={() => handleShowLog(job)} title="Show parser log" disabled={logLoadingId === job.id}>
                  <FileText size={16} />
                </button>
                {job.status === "failed" ? (
                  <button className="iconButton" onClick={() => handleRetry(job)} title="Retry failed job" disabled={retryingId === job.id}>
                    <RotateCcw className={retryingId === job.id ? "spin" : ""} size={16} />
                  </button>
                ) : null}
              </div>
            </div>
          ))}
          {!loading && jobs.length === 0 ? (
            <div className="emptyState">
              <strong>No parser jobs yet.</strong>
              <span>New uploads and rescans will create parser jobs here.</span>
            </div>
          ) : null}
          {!loading && jobs.length > 0 && filteredJobs.length === 0 ? (
            <div className="emptyState">
              <strong>No parser jobs match this view.</strong>
              <span>Try another search or status filter.</span>
            </div>
          ) : null}
        </div>
      </section>

      {selectedLog ? (
        <section className="panel">
          <div className="panelHead">
            <h2>Parser log #{selectedLog.jobId}</h2>
            <div className="rowActions">
              <span>{selectedLog.exists ? selectedLog.truncated ? "latest lines" : "full log" : "missing"}</span>
              <button className="ghostButton" onClick={() => handleCopyLog(selectedLog)} type="button">
                <Copy size={16} />
                Copy log
              </button>
            </div>
          </div>
          <pre className="parserLog">
            {selectedLog.exists ? selectedLog.text || "Log is empty." : "Parser log file was not found for this job."}
          </pre>
        </section>
      ) : null}
    </div>
  );
}

function fileName(value: string): string {
  return value.split("/").pop() || value;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}
