import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Plus, Zap, ZapOff } from "lucide-react";
import { useIsMobile } from "../../../hooks/useIsMobile";
import { mockTriggers } from "./mockData";
import type { Trigger } from "./mockData";
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

export default function Triggers() {
  useOutletContext<{ agent: AgentConfig }>();
  const isMobile = useIsMobile();
  const [triggers, setTriggers] = useState<Trigger[]>(mockTriggers);

  const toggleTrigger = (id: string) => {
    setTriggers((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, status: t.status === "active" ? "paused" : "active" }
          : t,
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
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>Triggers</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>
            Events that wake the agent
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
          {!isMobile && "New Trigger"}
        </button>
      </div>

      {/* Trigger cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {triggers.map((trigger) => {
          const isActive = trigger.status === "active";
          return (
            <div
              key={trigger.id}
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                padding: isMobile ? "14px 16px" : "16px 20px",
              }}
            >
              {/* Top row */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  marginBottom: 10,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: isActive
                        ? "color-mix(in srgb, var(--warning) 12%, transparent)"
                        : "var(--bg-secondary)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {isActive ? (
                      <Zap size={16} style={{ color: "var(--warning)" }} />
                    ) : (
                      <ZapOff size={16} style={{ color: "var(--text-muted)" }} />
                    )}
                  </div>
                  <div>
                    <h3 style={{ fontSize: 15, fontWeight: 600 }}>{trigger.name}</h3>
                    <div style={{ display: "flex", gap: 6, marginTop: 3 }}>
                      <span
                        style={{
                          fontSize: 11,
                          fontFamily: "monospace",
                          color: "var(--accent)",
                          background: "color-mix(in srgb, var(--accent) 12%, transparent)",
                          padding: "2px 7px",
                          borderRadius: 5,
                        }}
                      >
                        {trigger.source}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 500,
                          color: isActive ? "var(--success)" : "var(--text-muted)",
                          background: isActive
                            ? "color-mix(in srgb, var(--success) 12%, transparent)"
                            : "var(--bg-secondary)",
                          padding: "2px 7px",
                          borderRadius: 5,
                        }}
                      >
                        {isActive ? "Active" : "Paused"}
                      </span>
                    </div>
                  </div>
                </div>
                {/* Toggle button */}
                <button
                  onClick={() => toggleTrigger(trigger.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "6px 14px",
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 500,
                    background: "transparent",
                    color: isActive ? "var(--warning)" : "var(--success)",
                    border: `1px solid color-mix(in srgb, ${isActive ? "var(--warning)" : "var(--success)"} 30%, transparent)`,
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = `color-mix(in srgb, ${isActive ? "var(--warning)" : "var(--success)"} 10%, transparent)`)
                  }
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  {isActive ? "Pause" : "Enable"}
                </button>
              </div>

              {/* Event and condition */}
              <div style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 13, marginBottom: 3 }}>
                  <span style={{ color: "var(--text-muted)" }}>Event: </span>
                  <span>{trigger.event}</span>
                </div>
                {trigger.condition && (
                  <div style={{ fontSize: 13 }}>
                    <span style={{ color: "var(--text-muted)" }}>Condition: </span>
                    <span style={{ fontStyle: "italic" }}>{trigger.condition}</span>
                  </div>
                )}
              </div>

              {/* Description */}
              <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5, marginBottom: 10 }}>
                {trigger.description}
              </p>

              {/* Footer */}
              {trigger.lastTriggered && (
                <div
                  style={{
                    paddingTop: 10,
                    borderTop: "1px solid var(--border)",
                    fontSize: 12,
                    color: "var(--text-muted)",
                  }}
                >
                  Last triggered: {timeAgo(trigger.lastTriggered)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
