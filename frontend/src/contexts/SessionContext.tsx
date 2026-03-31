import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from "react";

export type SessionType = "web" | "cli";

export interface ActiveSessionInfo {
  type: SessionType;
  startedAt?: number;
}

export interface SummonInfo {
  message: string;
  urgency: "normal" | "urgent";
  createdAt: string;
}

interface SessionContextValue {
  /** Map of chatId → session info for all currently active sessions */
  activeSessions: Map<string, ActiveSessionInfo>;
  /** Whether the connection to the server is healthy */
  connected: boolean;
  /** Incremented on chat_metadata_updated / user_summoned events — use as a dependency to trigger refetch */
  metadataVersion: number;
  /** Set of chatIds that currently have an active summon (for immediate visual feedback) */
  summonedChatIds: Set<string>;
}

const SessionContext = createContext<SessionContextValue>({
  activeSessions: new Map(),
  connected: false,
  metadataVersion: 0,
  summonedChatIds: new Set(),
});

/**
 * Hook to access the full session context.
 */
export function useSessionContext(): SessionContextValue {
  return useContext(SessionContext);
}

/**
 * Convenience hook to check if a specific chat is currently active.
 * Returns the session info if active, or null if not.
 */
export function useIsSessionActive(chatId: string | undefined): ActiveSessionInfo | null {
  const { activeSessions } = useSessionContext();
  if (!chatId) return null;
  return activeSessions.get(chatId) ?? null;
}

/**
 * Hook to get the metadata version counter. Use as a dependency to trigger
 * refetch when chat metadata changes (status, summon, title) via polling.
 */
export function useMetadataVersion(): number {
  return useSessionContext().metadataVersion;
}

/**
 * Hook to get the set of chat IDs that currently have an active summon.
 */
export function useSummonedChatIds(): Set<string> {
  return useSessionContext().summonedChatIds;
}

const POLL_INTERVAL_MS = 1_000;
const FAILURE_THRESHOLD = 3;

/**
 * Provider that polls /api/sessions/poll every second and keeps an
 * in-memory map of all active chat sessions.
 *
 * The server returns version counters with each response. When versions
 * haven't changed, the response is tiny and no state updates occur
 * (zero re-renders). Full session/summon payloads are only included
 * when the corresponding version counter has changed.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<Map<string, ActiveSessionInfo>>(new Map());
  const [connected, setConnected] = useState(false);
  const [metadataVersion, setMetadataVersion] = useState(0);
  const [summonedChatIds, setSummonedChatIds] = useState<Set<string>>(new Set());

  // Track server versions and connection state in refs to avoid triggering re-renders on every poll
  const lastVersionRef = useRef<number | undefined>(undefined);
  const lastMetaVersionRef = useRef<number | undefined>(undefined);
  const consecutiveFailuresRef = useRef(0);
  const connectedRef = useRef(false);
  const pollRef = useRef<() => Promise<void>>();

  useEffect(() => {
    let mounted = true;

    const poll = async () => {
      try {
        const params = new URLSearchParams();
        if (lastVersionRef.current !== undefined) params.set("v", String(lastVersionRef.current));
        if (lastMetaVersionRef.current !== undefined) params.set("mv", String(lastMetaVersionRef.current));

        const res = await fetch(`/api/sessions/poll?${params}`, { credentials: "include" });
        if (!mounted) return;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        if (!mounted) return;

        consecutiveFailuresRef.current = 0;
        if (!connectedRef.current) {
          connectedRef.current = true;
          setConnected(true);
        }

        // Sessions changed — rebuild the map
        if (data.sessions !== undefined && data.version !== lastVersionRef.current) {
          const map = new Map<string, ActiveSessionInfo>();
          for (const [chatId, info] of Object.entries(data.sessions)) {
            map.set(chatId, info as ActiveSessionInfo);
          }
          setSessions(map);
        }
        lastVersionRef.current = data.version;

        // Metadata changed — bump local counter and diff summons
        if (data.metadataVersion !== lastMetaVersionRef.current) {
          lastMetaVersionRef.current = data.metadataVersion;
          setMetadataVersion((v) => v + 1);

          if (data.activeSummons) {
            const serverSummons = data.activeSummons as Record<string, SummonInfo>;
            const newSet = new Set(Object.keys(serverSummons));

            setSummonedChatIds((prev) => {
              // Fire browser notifications for newly-appeared summons
              for (const chatId of newSet) {
                if (!prev.has(chatId)) {
                  const summon = serverSummons[chatId];
                  if (summon?.urgency === "urgent" && typeof Notification !== "undefined" && Notification.permission === "granted") {
                    new Notification("Agent needs your attention", {
                      body: summon.message,
                      tag: `summon-${chatId}`,
                    });
                  }
                }
              }
              return newSet;
            });
          }
        }
      } catch {
        if (!mounted) return;
        consecutiveFailuresRef.current++;
        if (consecutiveFailuresRef.current >= FAILURE_THRESHOLD && connectedRef.current) {
          connectedRef.current = false;
          setConnected(false);
        }
      }
    };

    pollRef.current = poll;

    // Immediate first poll, then every POLL_INTERVAL_MS
    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);

    // On tab resume (or network restore while visible), force an immediate
    // full poll so downstream consumers get accurate session state without
    // waiting up to POLL_INTERVAL_MS. Resetting version refs ensures the
    // server returns full payloads instead of "nothing changed" responses —
    // the browser may have missed version bumps while the tab was suspended.
    const handleResume = () => {
      if (document.visibilityState === "visible") {
        lastVersionRef.current = undefined;
        lastMetaVersionRef.current = undefined;
        pollRef.current?.();
      }
    };

    document.addEventListener("visibilitychange", handleResume);
    window.addEventListener("online", handleResume);

    return () => {
      mounted = false;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleResume);
      window.removeEventListener("online", handleResume);
    };
  }, []);

  return <SessionContext.Provider value={{ activeSessions: sessions, connected, metadataVersion, summonedChatIds }}>{children}</SessionContext.Provider>;
}
