import { useMemo, useState } from "react";
import { CheckCircle2, Cloud, Loader2, RotateCcw, Trash2, UploadCloud, XCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { completeReplayUpload, presignReplayUpload, type ReplayUploadTicket } from "../api/client";
import { MetricCard } from "../components/ui";

type UploadState = "idle" | "uploading" | "done" | "failed";

interface UploadEntry {
  id: string;
  file: File;
  status: UploadState;
  progress: number;
  message: string;
  matchId?: number;
  jobId?: number;
}

export function UploadPage() {
  const [entries, setEntries] = useState<UploadEntry[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const totals = useMemo(() => ({
    all: entries.length,
    done: entries.filter((entry) => entry.status === "done").length,
    failed: entries.filter((entry) => entry.status === "failed").length
  }), [entries]);

  function addFiles(files: FileList | File[]) {
    const rejected: string[] = [];
    const duplicates: string[] = [];
    const seenKeys = new Set(entries.map((entry) => getFileKey(entry.file)));
    const next: UploadEntry[] = [];

    for (const file of Array.from(files)) {
      if (!file.name.toLowerCase().endsWith(".dem")) {
        rejected.push(file.name);
        continue;
      }

      const key = getFileKey(file);
      if (seenKeys.has(key)) {
        duplicates.push(file.name);
        continue;
      }

      seenKeys.add(key);
      next.push({
        id: createUploadId(file),
        file,
        status: "idle",
        progress: 0,
        message: "Ready"
      });
    }

    setEntries((current) => [...next, ...current]);
    setNotice(formatAddFilesNotice(rejected, duplicates));
  }

  async function uploadAll() {
    setIsUploading(true);
    try {
      for (const entry of entries) {
        if (entry.status === "done") {
          continue;
        }
        await uploadOne(entry);
      }
    } finally {
      setIsUploading(false);
    }
  }

  async function uploadOne(entry: UploadEntry) {
    updateEntry(entry.id, {
      status: "uploading",
      progress: 2,
      message: "Preparing signed upload",
      matchId: undefined,
      jobId: undefined
    });
    try {
      const ticket = await presignReplayUpload(entry.file);
      updateEntry(entry.id, { progress: 8, message: "Uploading to Wasabi" });
      await putToWasabi(ticket, entry.file, (progress) => updateEntry(entry.id, { progress }));
      updateEntry(entry.id, { progress: 96, message: "Creating parse job" });
      const result = await completeReplayUpload(ticket, entry.file);
      updateEntry(entry.id, {
        status: "done",
        progress: 100,
        message: `Queued match ${result.match.matchId || result.match.id}`,
        matchId: result.match.id,
        jobId: result.jobId
      });
    } catch (error) {
      updateEntry(entry.id, {
        status: "failed",
        message: error instanceof Error ? error.message : "Upload failed"
      });
    }
  }

  async function retryUpload(entry: UploadEntry) {
    setIsUploading(true);
    try {
      await uploadOne(entry);
    } finally {
      setIsUploading(false);
    }
  }

  function updateEntry(id: string, patch: Partial<UploadEntry>) {
    setEntries((current) => current.map((entry) => entry.id === id ? { ...entry, ...patch } : entry));
  }

  function removeEntry(id: string) {
    setEntries((current) => current.filter((entry) => entry.id !== id));
  }

  return (
    <div className="page uploadPage">
      <header className="pageHeader">
        <div>
          <span className="eyebrow">Direct cloud upload</span>
          <h1>Upload replays</h1>
          <p>Files go straight from this browser to Wasabi. The parser downloads a temporary copy only when the job starts.</p>
        </div>
        <button className="primaryButton" onClick={uploadAll} disabled={isUploading || entries.length === 0}>
          {isUploading ? <Loader2 className="spin" size={17} /> : <UploadCloud size={17} />}
          Upload queue
        </button>
      </header>

      <section className="statusGrid uploadStats">
        <MetricCard icon={<Cloud size={18} />} label="Selected" value={totals.all} />
        <MetricCard icon={<CheckCircle2 size={18} />} label="Queued" value={totals.done} />
        <MetricCard icon={<XCircle size={18} />} label="Failed" value={totals.failed} danger={totals.failed > 0} />
      </section>

      <label
        className={`dropZone ${dragActive ? "active" : ""}`}
        onDragEnter={() => setDragActive(true)}
        onDragLeave={() => setDragActive(false)}
        onDragOver={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragActive(false);
          addFiles(event.dataTransfer.files);
        }}
      >
        <UploadCloud size={34} />
        <strong>Drop .dem files here</strong>
        <span>or click to select files from this computer</span>
        <input
          type="file"
          accept=".dem"
          multiple
          onChange={(event) => {
            if (event.target.files) {
              addFiles(event.target.files);
            }
            event.currentTarget.value = "";
          }}
        />
      </label>

      {notice ? <div className="notice danger">{notice}</div> : null}

      <section className="panel">
        <div className="panelHead">
          <h2>Upload queue</h2>
          <span>{entries.length ? `${entries.length} files` : "empty"}</span>
        </div>
        <div className="uploadList">
          {entries.map((entry) => (
            <div className={`uploadRow ${entry.status}`} key={entry.id}>
              <div className="uploadFile">
                <strong>{entry.file.name}</strong>
                <small>
                  {formatBytes(entry.file.size)} · {entry.message}
                  {entry.matchId ? <> · <Link to={`/admin/matches/${entry.matchId}`}>Match {entry.matchId}</Link></> : null}
                  {entry.jobId ? <> · <Link to="/admin/jobs">Job {entry.jobId}</Link></> : null}
                </small>
              </div>
              <span className={`statusPill ${entry.status}`}>{entry.status}</span>
              {entry.status === "failed" ? (
                <button className="iconButton" onClick={() => retryUpload(entry)} title="Retry upload" disabled={isUploading}>
                  <RotateCcw size={16} />
                </button>
              ) : null}
              {entry.status === "idle" || entry.status === "failed" ? (
                <button className="iconButton danger" onClick={() => removeEntry(entry.id)} title="Remove from queue" disabled={isUploading}>
                  <Trash2 size={16} />
                </button>
              ) : null}
              <div className="uploadProgress">
                <span style={{ width: `${entry.progress}%` }} />
              </div>
            </div>
          ))}
          {entries.length === 0 ? <div className="emptyState">No replay files selected yet.</div> : null}
        </div>
      </section>
    </div>
  );
}

function getFileKey(file: File): string {
  return `${file.name}:${file.size}`;
}

function createUploadId(file: File): string {
  const browserCrypto = globalThis.crypto;
  const randomPart = browserCrypto && typeof browserCrypto.randomUUID === "function"
    ? browserCrypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return `${file.name}-${file.size}-${randomPart}`;
}

function formatAddFilesNotice(rejected: string[], duplicates: string[]): string | null {
  const parts: string[] = [];
  if (rejected.length > 0) {
    parts.push(`Rejected ${formatFileList(rejected)} because only .dem files can be uploaded.`);
  }
  if (duplicates.length > 0) {
    parts.push(`Skipped duplicate ${formatFileList(duplicates)} already in the queue.`);
  }
  return parts.length > 0 ? parts.join(" ") : null;
}

function formatFileList(names: string[]): string {
  if (names.length <= 3) {
    return names.join(", ");
  }
  return `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`;
}

function putToWasabi(ticket: ReplayUploadTicket, file: File, onProgress: (progress: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", ticket.url);
    for (const [key, value] of Object.entries(ticket.headers || {})) {
      request.setRequestHeader(key, value);
    }
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.max(8, Math.min(94, Math.round((event.loaded / event.total) * 90))));
      }
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        resolve();
      } else {
        reject(new Error(`Wasabi upload failed: ${request.status}`));
      }
    };
    request.onerror = () => reject(new Error("Wasabi upload failed. Check bucket CORS settings."));
    request.send(file);
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
