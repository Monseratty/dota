import { useEffect, useMemo, useState } from "react";
import { FileText, RefreshCw, RotateCcw } from "lucide-react";
import { Link } from "react-router-dom";
import { getJobLog, getJobs, retryJob, type ParseJob, type ParserLog } from "../api/client";

export function JobsPage() {
  const [jobs, setJobs] = useState<ParseJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLog, setSelectedLog] = useState<ParserLog | null>(null);
  const [logLoadingId, setLogLoadingId] = useState<number | null>(null);
  const [retryingId, setRetryingId] = useState<number | null>(null);

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
    queued: jobs.filter((job) => job.status === "queued").length,
    running: jobs.filter((job) => job.status === "running").length,
    done: jobs.filter((job) => job.status === "done").length,
    failed: jobs.filter((job) => job.status === "failed").length
  }), [jobs]);

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

  return (
    <div className="page">
      <header className="pageHeader">
        <div>
          <span className="eyebrow">Parser queue</span>
          <h1>Jobs</h1>
        </div>
        <button className="ghostButton" onClick={() => refresh()} disabled={loading}>
          <RefreshCw size={17} />
          Refresh
        </button>
      </header>

      <section className="statusGrid">
        <Metric label="Queued" value={totals.queued} />
        <Metric label="Running" value={totals.running} />
        <Metric label="Done" value={totals.done} />
        <Metric label="Failed" value={totals.failed} danger={totals.failed > 0} />
      </section>

      {error ? <div className="notice danger">{error}</div> : null}

      <section className="panel">
        <div className="panelHead">
          <h2>Recent parser jobs</h2>
          <span>{loading ? "loading" : `${jobs.length} latest`}</span>
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
          {jobs.map((job) => (
            <div className="jobRow" key={job.id}>
              <div>
                <strong>#{job.id}</strong>
                <small>{fileName(job.rawFilePath)}</small>
              </div>
              <Link to={`/matches/${job.matchId}`}>Match {job.matchId}</Link>
              <div className="statusStack">
                <span className={`statusPill ${job.status}`}>{job.status}</span>
                {job.errorMessage ? <small title={job.errorMessage}>{job.errorMessage}</small> : null}
              </div>
              <span>{job.attempts}</span>
              <span>{job.startedAt ? formatDate(job.startedAt) : "-"}</span>
              <span>{job.finishedAt ? formatDate(job.finishedAt) : "-"}</span>
              <div className="rowActions">
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
          {!loading && jobs.length === 0 ? <div className="emptyState">No parser jobs yet.</div> : null}
        </div>
      </section>

      {selectedLog ? (
        <section className="panel">
          <div className="panelHead">
            <h2>Parser log #{selectedLog.jobId}</h2>
            <span>{selectedLog.exists ? selectedLog.truncated ? "latest lines" : "full log" : "missing"}</span>
          </div>
          <pre className="parserLog">
            {selectedLog.exists ? selectedLog.text || "Log is empty." : "Parser log file was not found for this job."}
          </pre>
        </section>
      ) : null}
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

function fileName(value: string): string {
  return value.split("/").pop() || value;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}
