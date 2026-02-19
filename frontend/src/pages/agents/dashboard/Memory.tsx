import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Plus, Search, ChevronDown, ChevronRight } from "lucide-react";
import { useIsMobile } from "../../../hooks/useIsMobile";
import { mockMemory } from "./mockData";
import type { AgentConfig } from "shared";

const categoryConfig: Record<string, { color: string; label: string }> = {
  fact: { color: "#58a6ff", label: "Fact" },
  preference: { color: "var(--accent)", label: "Preference" },
  context: { color: "var(--success)", label: "Context" },
  instruction: { color: "var(--warning)", label: "Instruction" },
};

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

export default function Memory() {
  useOutletContext<{ agent: AgentConfig }>();
  const isMobile = useIsMobile();
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filtered = mockMemory.filter((item) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      item.key.toLowerCase().includes(q) ||
      item.value.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q)
    );
  });

  return (
    <div style={{ padding: isMobile ? "16px" : "24px 32px", maxWidth: 800, margin: "0 auto" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>Memory</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>
            Stored knowledge and agent context
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
          {!isMobile && "Add Memory"}
        </button>
      </div>

      {/* Search */}
      <div
        style={{
          position: "relative",
          marginBottom: 16,
        }}
      >
        <Search
          size={16}
          style={{
            position: "absolute",
            left: 14,
            top: "50%",
            transform: "translateY(-50%)",
            color: "var(--text-muted)",
            pointerEvents: "none",
          }}
        />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search memories..."
          style={{
            width: "100%",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            padding: "12px 14px 12px 38px",
            fontSize: 14,
          }}
        />
      </div>

      {/* Category legend */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        {Object.entries(categoryConfig).map(([key, conf]) => (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12 }}>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: conf.color,
              }}
            />
            <span style={{ color: "var(--text-muted)" }}>{conf.label}</span>
          </div>
        ))}
      </div>

      {/* Memory items */}
      {filtered.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "48px 20px",
            color: "var(--text-muted)",
            fontSize: 14,
          }}
        >
          {search.trim() ? "No memories matching your search." : "No memories stored yet."}
        </div>
      ) : (
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            overflow: "hidden",
          }}
        >
          {filtered.map((item, i) => {
            const catConf = categoryConfig[item.category];
            const isExpanded = expanded.has(item.id);

            return (
              <div
                key={item.id}
                style={{
                  borderBottom: i < filtered.length - 1 ? "1px solid var(--border)" : "none",
                }}
              >
                <button
                  onClick={() => toggleExpand(item.id)}
                  style={{
                    width: "100%",
                    padding: "14px 16px",
                    background: "transparent",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 12,
                    textAlign: "left",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-secondary)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  {/* Expand icon */}
                  <div style={{ marginTop: 2, flexShrink: 0, color: "var(--text-muted)" }}>
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 4,
                        flexWrap: "wrap",
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "monospace",
                          fontSize: 14,
                          fontWeight: 600,
                        }}
                      >
                        {item.key}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          color: catConf.color,
                          background: `color-mix(in srgb, ${catConf.color} 12%, transparent)`,
                          padding: "2px 7px",
                          borderRadius: 5,
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                        }}
                      >
                        {catConf.label}
                      </span>
                      <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: "auto" }}>
                        {timeAgo(item.updatedAt)}
                      </span>
                    </div>

                    <p
                      style={{
                        fontSize: 13,
                        color: "var(--text-muted)",
                        lineHeight: 1.5,
                        overflow: isExpanded ? "visible" : "hidden",
                        textOverflow: isExpanded ? "unset" : "ellipsis",
                        whiteSpace: isExpanded ? "pre-wrap" : "nowrap",
                      }}
                    >
                      {item.value}
                    </p>
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
