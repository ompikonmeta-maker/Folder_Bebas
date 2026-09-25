import { useEffect, useState } from "react";
import { clearFinishedJobs, isDesktop, listJobs, onJobProgress, revealPath, runQueue } from "../lib/api";
import { presetByKey } from "../lib/presets";
import type { ExportJob } from "../types";

interface Props {
  projectId: number;
  onToggleSidebar: () => void;
}

export function RenderQueue({ projectId, onToggleSidebar }: Props) {
  const [jobs, setJobs] = useState<ExportJob[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    listJobs(projectId).then(setJobs).catch(() => {});
  }

  useEffect(() => {
    refresh();
    const un = onJobProgress((j) => {
      setJobs((prev) => prev.map((p) => (p.id === j.id ? j : p)));
    });
    return () => {
      un.then((f) => f());
    };
  }, [projectId]);

  async function handleRun() {
    setError(null);
    setRunning(true);
    try {
      await runQueue(projectId);
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setRunning(false);
    }
  }

  async function handleClear() {
    try {
      await clearFinishedJobs(projectId);
      await refresh();
    } catch (e) {
      setError(String(e));
    }
  }

  const queued = jobs.filter((j) => j.status === "queued").length;
  const done = jobs.filter((j) => j.status === "done").length;
  const errored = jobs.filter((j) => j.status === "error").length;

  return (
    <section className="canvas">
      <div className="topbar">
        <button className="icon-btn" onClick={onToggleSidebar} title="Toggle sidebar" aria-label="Toggle sidebar">
          ≡
        </button>
        <div className="title-wrap">
          <h1>Render Queue</h1>
          <p>
            {queued} queued · {done} done{errored ? ` · ${errored} error` : ""}
          </p>
        </div>
        <div className="grow" />
        <button className="btn tonal" onClick={handleClear} disabled={done + errored === 0}>
          Clear finished
        </button>
        <button className="btn" onClick={handleRun} disabled={running || queued === 0}>
          {running ? "Rendering…" : `Run queue (${queued}) →`}
        </button>
      </div>

      {error && <div className="banner danger">{error}</div>}

      {jobs.length === 0 ? (
        <p className="empty">
          Queue is empty. In the workspace, set a platform + resolution and press
          “Queue export”.
        </p>
      ) : (
        <div className="job-list">
          {jobs.map((j) => (
            <div className="job" key={j.id}>
              <span className={"pill " + j.status}>{j.status}</span>
              <div className="job-body">
                <b>
                  clip #{j.clip_id} · {presetByKey(j.platform_preset).label} · {j.resolution}
                  {j.combine ? " · combined" : ""}
                </b>
                <small>
                  {j.width}×{j.height}
                  {j.output_path ? ` · ${j.output_path.split(/[\\/]/).pop()}` : ""}
                  {j.error ? ` · ${j.error}` : ""}
                </small>
                <div className="bar">
                  <i
                    style={{
                      width: `${j.progress}%`,
                      background:
                        j.status === "error" ? "var(--danger)" : undefined,
                    }}
                  />
                </div>
              </div>
              {isDesktop() && j.status === "done" && j.output_path && (
                <button
                  className="mini format"
                  title="Open output folder"
                  onClick={() => revealPath(j.output_path ?? "")}
                >
                  ⤢
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
