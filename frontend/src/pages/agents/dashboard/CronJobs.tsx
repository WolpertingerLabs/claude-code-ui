import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Plus, Play, Pause, CheckCircle, Clock, RotateCcw, Calendar } from "lucide-react";
import { useIsMobile } from "../../../hooks/useIsMobile";
import { mockCronJobs } from "./mockData";
import type { CronJob } from "./mockData";
import type { AgentConfig } from "shared";

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function timeUntil(ts: number): string {
  const diff = ts - Date.now();
  if (diff < 0) return "Overdue";
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `in ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `in ${hours}h`;
  const days = Math.floor(hours / 24);
  return `in ${days}d`;
}

const statusConfig: Record<string, { color: string; icon: typeof Play; label: string }> = {
  active: { color: "var(--success)", icon: Play, label: "Active" },
  paused: { color: "var(--warning)", icon: Pause, label: "Paused" },
  completed: { color: "var(--text-muted)", icon: CheckCircle, label: "Completed" },
};

const typeConfig: Record<string, { color: string; icon: typeof Clock }> = {
  "one-off": { color: "var(--accent)", icon: Calendar },
  recurring: { color: "var(--success)", icon: RotateCcw },
  indefinite: { color: "var(--warning)", icon: Clock },
};

export default function CronJobs() {
  useOutletContext<{ agent: AgentConfig }>();
  const isMobile = useIsMobile();
  const [jobs, setJobs] = useState<CronJob[]>(mockCronJobs);

  const toggleJob = (id: string) => {
    setJobs((prev) =>
      prev.map((j) =>
        j.id === id
          ? { ...j, status: j.status === "active" ? "paused" : j.status === "paused" ? "active" : j.status }
          : j,
      ),
    );
  };

  return (
    <div style={{ padding: isMobile ? "16px" : "24px 32px", maxWidth: 800, margin: "0 auto" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 20,
        }}
      >
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>Cron Jobs</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>
            Scheduled tasks and timed events
          </p>
        </div>
        <button
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "var(--accent)",
            color: "#fff",
            padding: "8px 14px",
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 500,
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-hover)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent)")}
        >
          <Plus size={16} />
          {!isMobile && "New Job"}
        </button>
      </div>

      {/* Job list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {jobs.map((job) => {
          const sConf = statusConfig[job.status];
          const tConf = typeConfig[job.type];
          const StatusIcon = sConf.icon;
          const TypeIcon = tConf.icon;
          const canToggle = job.status !== "completed";

          return (
            <div
              key={job.id}
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                padding: isMobile ? "14px 16px" : "16px 20px",
              }}
            >
              {/* Top row: name, status, type */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  marginBottom: 8,
                  flexWrap: "wrap",
                }}
              >
                <h3 style={{ fontSize: 15, fontWeight: 600 }}>{job.name}</h3>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {/* Type pill */}
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      fontSize: 11,
                      fontWeight: 500,
                      color: tConf.color,
                      background: `color-mix(in srgb, ${tConf.color} 12%, transparent)`,
                      padding: "3px 8px",
                      borderRadius: 6,
                    }}
                  >
                    <TypeIcon size={12} />
                    {job.type}
                  </span>
                  {/* Status badge */}
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      fontSize: 11,
                      fontWeight: 500,
                      color: sConf.color,
                      background: `color-mix(in srgb, ${sConf.color} 12%, transparent)`,
                      padding: "3px 8px",
                      borderRadius: 6,
                    }}
                  >
                    <StatusIcon size={12} />
                    {sConf.label}
                  </span>
                </div>
              </div>

              {/* Schedule */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 13,
                  color: "var(--text-muted)",
                  marginBottom: 6,
                }}
              >
                <Clock size={13} />
                {job.schedule}
              </div>

              {/* Description */}
              <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5, marginBottom: 10 }}>
                {job.description}
              </p>

              {/* Footer: timestamps + toggle */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingTop: 10,
                  borderTop: "1px solid var(--border)",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--text-muted)" }}>
                  {job.lastRun && <span>Last run: {timeAgo(job.lastRun)}</span>}
                  {job.nextRun && (
                    <span style={{ color: "var(--text)" }}>Next run: {timeUntil(job.nextRun)}</span>
                  )}
                </div>
                {canToggle && (
                  <button
                    onClick={() => toggleJob(job.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "6px 12px",
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 500,
                      background: "transparent",
                      color: job.status === "active" ? "var(--warning)" : "var(--success)",
                      border: `1px solid color-mix(in srgb, ${job.status === "active" ? "var(--warning)" : "var(--success)"} 30%, transparent)`,
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = `color-mix(in srgb, ${job.status === "active" ? "var(--warning)" : "var(--success)"} 10%, transparent)`)
                    }
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    {job.status === "active" ? <Pause size={12} /> : <Play size={12} />}
                    {job.status === "active" ? "Pause" : "Resume"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
