import { useOutletContext } from "react-router-dom";
import { Wifi, ExternalLink, Info } from "lucide-react";
import { useIsMobile } from "../../../hooks/useIsMobile";
import type { AgentConfig } from "../../../api";

// Connections are managed by mcp-secure-proxy, not by claude-code-ui.
// This page is a read-only status view showing which connections are available.

const KNOWN_CONNECTIONS = [
  { name: "Discord Bot", alias: "discord-bot", description: "Real-time messaging via Discord Gateway WebSocket" },
  { name: "GitHub", alias: "github", description: "Webhooks for push, PR, issue events" },
  { name: "Slack", alias: "slack", description: "Workspace integration via Socket Mode" },
  { name: "Stripe", alias: "stripe", description: "Payment and subscription webhooks" },
  { name: "Trello", alias: "trello", description: "Board and card update webhooks" },
  { name: "Notion", alias: "notion", description: "Database and page update polling" },
  { name: "Linear", alias: "linear", description: "Issue and project update polling" },
  { name: "Google", alias: "google", description: "Calendar, Drive, Gmail API access" },
  { name: "Anthropic", alias: "anthropic", description: "Claude API access" },
  { name: "OpenRouter", alias: "openrouter", description: "Multi-model API routing" },
];

export default function Connections() {
  useOutletContext<{ agent: AgentConfig }>();
  const isMobile = useIsMobile();

  return (
    <div style={{ padding: isMobile ? "16px" : "24px 32px", maxWidth: 800, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>Connections</h1>
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>
          External services available via mcp-secure-proxy
        </p>
      </div>

      {/* Info banner */}
      <div
        style={{
          background: "color-mix(in srgb, var(--accent) 8%, transparent)",
          border: "1px solid color-mix(in srgb, var(--accent) 20%, transparent)",
          borderRadius: "var(--radius)",
          padding: "14px 18px",
          marginBottom: 20,
          display: "flex",
          gap: 12,
          alignItems: "flex-start",
        }}
      >
        <Info size={18} style={{ color: "var(--accent)", flexShrink: 0, marginTop: 2 }} />
        <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--text-muted)" }}>
          Connections are configured in <code style={{ fontFamily: "monospace", background: "var(--bg-secondary)", padding: "1px 5px", borderRadius: 4 }}>mcp-secure-proxy</code>&apos;s{" "}
          <code style={{ fontFamily: "monospace", background: "var(--bg-secondary)", padding: "1px 5px", borderRadius: 4 }}>remote.config.json</code>.
          The proxy manages authentication, secrets, and event ingestion. Agents access these services via MCP tools during sessions.
        </div>
      </div>

      {/* Connection cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)",
          gap: 12,
        }}
      >
        {KNOWN_CONNECTIONS.map((conn) => (
          <div
            key={conn.alias}
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "16px 18px",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: "color-mix(in srgb, var(--accent) 12%, transparent)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Wifi size={18} style={{ color: "var(--accent)" }} />
                </div>
                <div>
                  <h3 style={{ fontSize: 15, fontWeight: 600 }}>{conn.name}</h3>
                  <span
                    style={{
                      fontSize: 11,
                      fontFamily: "monospace",
                      color: "var(--text-muted)",
                    }}
                  >
                    {conn.alias}
                  </span>
                </div>
              </div>
              <ExternalLink size={14} style={{ color: "var(--text-muted)" }} />
            </div>
            <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5 }}>
              {conn.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
