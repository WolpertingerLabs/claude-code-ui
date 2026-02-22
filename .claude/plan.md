# Plan: Packaging mcp-secure-proxy with claude-code-ui

## Overview

Integrate mcp-secure-proxy as a bundled dependency of claude-code-ui, enabling:
1. **Local mode** — core proxy logic runs in-process (no separate server, no port, no encryption)
2. **Remote mode** — connect to an external mcp-secure-proxy remote server (encrypted, as today)
3. **Settings UI** — toggle local/remote, configure server URL, manage connections & keys
4. **Connection management** — users can enable services (Discord, GitHub, etc.) and provide API keys through the UI

---

## Part 1: Packaging mcp-secure-proxy

### Approach: Local File Dependency

Add mcp-secure-proxy as a `file:` reference in `backend/package.json`. Both repos live side-by-side under `WolpertingerLabs/`, so npm creates a symlink — zero duplication, instant updates during development. We'll publish to npm later for production/CI.

**Why `file:` reference:**
- Simplest integration — just a dependency, no submodule headaches
- npm symlinks the package, so changes in mcp-secure-proxy are immediately visible
- No nested repos, no `git submodule update --init` footguns
- Keeps repos independently deployable
- Easy to swap to a published npm package later (just change the version string)

### Implementation Steps

1. **Add file dependency** in `backend/package.json`:
   ```json
   "dependencies": {
     "mcp-secure-proxy": "file:../../mcp-secure-proxy"
   }
   ```

2. **Install** — npm creates a symlink:
   ```bash
   npm install
   ```

3. **Build integration** — mcp-secure-proxy must be built before the backend can import from it.
   Update root build script:
   ```json
   "build": "npm run build:proxy && npm run build:shared && npm run build:backend && npm run build:frontend",
   "build:proxy": "cd ../mcp-secure-proxy && npm run build"
   ```
   Or rely on mcp-secure-proxy's `postinstall` script (which already runs `npm run build`).

4. **Replace vendored proxy-client.ts** — import directly from the package:
   ```typescript
   // Before (vendored):
   import { ProxyClient } from "./proxy-client.js";

   // After (package import):
   import { HandshakeInitiator, EncryptedChannel } from "mcp-secure-proxy/shared/protocol";
   import { loadKeyBundle, loadPublicKeys } from "mcp-secure-proxy/shared/crypto";
   ```

   This requires mcp-secure-proxy to add proper `exports` to its package.json (see mcp-secure-proxy plan).

5. **Future: publish to npm** — when ready, publish mcp-secure-proxy and swap the dependency:
   ```json
   "mcp-secure-proxy": "^1.0.0"
   ```
   No other changes needed — all imports stay the same.

---

## Part 2: Local Mode — In-Process Proxy

### Concept

In local mode, there is **no separate server, no port, no child process, and no encryption**. The core proxy logic (route matching, secret injection, ingestor management) runs directly inside the claude-code-ui backend process.

A `LocalProxy` class imports the pure functions from mcp-secure-proxy and wraps them in the same `callTool(toolName, input)` interface as the existing `ProxyClient`, so all consuming code (event watcher, dashboard routes) works identically regardless of mode.

```
LOCAL MODE:
  backend → LocalProxy.callTool("poll_events", {...})
          → IngestorManager.getEvents(...)  [in-process]
          → result

REMOTE MODE (unchanged):
  backend → ProxyClient → encrypt → HTTP → remote server → decrypt → result
```

### Why no server for local

The remote server's core logic is three functions plus `fetch()`:
- `matchRoute(url, routes)` — find which connection template matches a URL
- `resolvePlaceholders(str, secrets)` — inject `${VAR}` values into headers/URLs/body
- `isEndpointAllowed(url, patterns)` — glob-match URL against allowlist

Everything else (handshake, encryption, sessions, rate limiting) exists only because the server was designed to be *remote*. For local, we skip all of it and call the functions directly.

### LocalProxy Class

New file: `backend/src/services/local-proxy.ts`

```typescript
import {
  loadRemoteConfig, resolveCallerRoutes, resolveRoutes,
  resolveSecrets, resolvePlaceholders,
  type ResolvedRoute,
} from "mcp-secure-proxy/shared/config";
import { matchRoute, isEndpointAllowed } from "mcp-secure-proxy/remote/server";
import { IngestorManager } from "mcp-secure-proxy/remote/ingestors";
import { listConnectionTemplates } from "mcp-secure-proxy/shared/connections";

export class LocalProxy {
  private routes: ResolvedRoute[];
  private ingestorManager: IngestorManager;
  private callerAlias: string;

  constructor(private mcpConfigDir: string, callerAlias: string) {
    this.callerAlias = callerAlias;

    // Load config and resolve routes — same logic the remote server uses at startup
    const config = loadRemoteConfig();  // reads from mcpConfigDir
    const callerRoutes = resolveCallerRoutes(config, callerAlias);
    const caller = config.callers[callerAlias];
    const callerEnv = resolveSecrets(caller?.env ?? {});
    this.routes = resolveRoutes(callerRoutes, callerEnv);

    // Start ingestors in-process
    this.ingestorManager = new IngestorManager(config);
  }

  async start(): Promise<void> {
    await this.ingestorManager.startAll();
  }

  async stop(): Promise<void> {
    await this.ingestorManager.stopAll();
  }

  /** Reinitialize after config/secret changes (re-reads config from disk) */
  async reinitialize(): Promise<void> {
    await this.stop();
    // Re-read config, re-resolve routes, restart ingestors
    const config = loadRemoteConfig();
    const callerRoutes = resolveCallerRoutes(config, this.callerAlias);
    const caller = config.callers[this.callerAlias];
    const callerEnv = resolveSecrets(caller?.env ?? {});
    this.routes = resolveRoutes(callerRoutes, callerEnv);
    this.ingestorManager = new IngestorManager(config);
    await this.start();
  }

  /** Same interface as ProxyClient.callTool() — drop-in replacement */
  async callTool(toolName: string, toolInput?: Record<string, unknown>): Promise<unknown> {
    switch (toolName) {
      case "http_request":
        return this.httpRequest(toolInput!);
      case "list_routes":
        return this.routes.map((route, index) => ({
          index,
          name: route.name,
          description: route.description,
          docsUrl: route.docsUrl,
          allowedEndpoints: route.allowedEndpoints,
          secretNames: Object.keys(route.secrets),
          autoHeaders: Object.keys(route.headers),
        }));
      case "poll_events": {
        const { connection, after_id } = toolInput as { connection?: string; after_id?: number };
        if (connection) {
          return this.ingestorManager.getEvents(this.callerAlias, connection, after_id ?? -1);
        }
        return this.ingestorManager.getAllEvents(this.callerAlias, after_id ?? -1);
      }
      case "ingestor_status":
        return this.ingestorManager.getStatuses(this.callerAlias);
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  /** Core request logic — same as remote server's http_request handler but in-process */
  private async httpRequest(input: Record<string, unknown>): Promise<unknown> {
    const { method, url, headers, body } = input as {
      method: string; url: string; headers: Record<string, string>; body?: unknown;
    };

    // 1. Match route
    let matched = matchRoute(url, this.routes);
    let resolvedUrl = url;
    if (matched) {
      resolvedUrl = resolvePlaceholders(url, matched.secrets);
    } else {
      for (const route of this.routes) {
        if (route.allowedEndpoints.length === 0) continue;
        const candidateUrl = resolvePlaceholders(url, route.secrets);
        if (isEndpointAllowed(candidateUrl, route.allowedEndpoints)) {
          matched = route;
          resolvedUrl = candidateUrl;
          break;
        }
      }
    }
    if (!matched) throw new Error(`Endpoint not allowed: ${url}`);

    // 2. Resolve headers, check conflicts, merge route headers
    const resolvedHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers ?? {})) {
      resolvedHeaders[k] = resolvePlaceholders(v, matched.secrets);
    }
    for (const [k, v] of Object.entries(matched.headers)) {
      resolvedHeaders[k] = v;
    }

    // 3. Resolve body if opted in
    let resolvedBody: string | undefined;
    if (typeof body === 'string') {
      resolvedBody = matched.resolveSecretsInBody ? resolvePlaceholders(body, matched.secrets) : body;
    } else if (body != null) {
      resolvedBody = JSON.stringify(body);
      if (!resolvedHeaders['Content-Type']) resolvedHeaders['Content-Type'] = 'application/json';
    }

    // 4. Make the actual HTTP request
    const resp = await fetch(resolvedUrl, { method, headers: resolvedHeaders, body: resolvedBody });
    const contentType = resp.headers.get('content-type') ?? '';
    const responseBody = contentType.includes('application/json') ? await resp.json() : await resp.text();

    return { status: resp.status, statusText: resp.statusText, headers: Object.fromEntries(resp.headers.entries()), body: responseBody };
  }
}
```

### Proxy Singleton Update

Update `backend/src/services/proxy-singleton.ts` to return either `LocalProxy` or `ProxyClient` based on mode:

```typescript
import { LocalProxy } from "./local-proxy.js";

// Shared interface both classes satisfy
interface ProxyLike {
  callTool(toolName: string, toolInput?: Record<string, unknown>): Promise<unknown>;
}

export function getProxy(alias: string): ProxyLike | null {
  const settings = getAgentSettings();

  if (settings.proxyMode === 'local') {
    return getLocalProxy(alias);  // cached LocalProxy instance
  } else {
    return getProxyClient(alias); // existing ProxyClient (encrypted, remote)
  }
}
```

### Webhook Route on claude-code-ui's Express

The one case that needs an HTTP endpoint: webhook ingestors (GitHub, Stripe, Trello sending POSTs to us). Mount a single route on the existing Express app:

```typescript
// In backend/src/index.ts or a new route file
app.post('/webhooks/:path', (req, res) => {
  const localProxy = getLocalProxyInstance();
  if (!localProxy) { res.status(404).json({ error: 'Local proxy not active' }); return; }

  const ingestors = localProxy.ingestorManager.getWebhookIngestors(req.params.path);
  if (ingestors.length === 0) { res.status(404).json({ error: 'No webhook ingestor' }); return; }

  for (const ingestor of ingestors) {
    ingestor.handleWebhook(req.headers, req.body);
  }
  res.json({ received: true });
});
```

### Proxy MCP Server for All Sessions

Proxy tools must be available in **all** chat sessions (not just agent sessions). Agent tools (`agent-tools.ts`) are only injected when `agentAlias` is provided, so they're the wrong place for proxy tools.

Instead, we create a **separate SDK-based MCP server** for proxy tools that gets injected unconditionally for every session — the same pattern as agent tools, but not gated behind `if (opts.agentAlias)`.

New file: `backend/src/services/proxy-tools.ts`

```typescript
import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { getProxy } from "./proxy-singleton.js";
import { getAgentSettings } from "./agent-settings.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("proxy-tools");

/**
 * Build an in-process MCP server exposing proxy tools (api_request, list_routes,
 * poll_events, ingestor_status).
 *
 * Injected into EVERY chat session — both regular chats and agent chats.
 * In local mode, calls go through LocalProxy (in-process).
 * In remote mode, calls go through ProxyClient (encrypted HTTP).
 *
 * @param keyAlias - Which key alias to use for this session.
 *   For agent chats, this is the agent's mcpKeyAlias.
 *   For regular chats, this is the default alias from settings.
 */
export function buildProxyToolsServer(keyAlias: string) {
  return createSdkMcpServer({
    name: "mcp-proxy",
    version: "1.0.0",
    tools: [
      tool(
        "secure_request",
        "Make an authenticated HTTP request through a configured connection. " +
        "Route-level headers (e.g., Authorization) are injected automatically. " +
        "Use list_routes first to discover available APIs.",
        {
          method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).describe("HTTP method"),
          url: z.string().describe("Full URL, may contain ${VAR} placeholders"),
          headers: z.record(z.string()).optional().describe("Request headers"),
          body: z.any().optional().describe("Request body (object for JSON, string for raw)"),
        },
        async (input) => {
          const proxy = getProxy(keyAlias);
          if (!proxy) return { content: [{ type: "text", text: "Proxy not configured" }] };
          const result = await proxy.callTool("http_request", input);
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        },
      ),

      tool(
        "list_routes",
        "List all available API routes/connections and their endpoints, " +
        "auto-injected headers, and available secret placeholder names.",
        {},
        async () => {
          const proxy = getProxy(keyAlias);
          if (!proxy) return { content: [{ type: "text", text: "Proxy not configured" }] };
          const result = await proxy.callTool("list_routes");
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        },
      ),

      tool(
        "poll_events",
        "Poll for new events from ingestors (Discord messages, GitHub webhooks, etc.). " +
        "Pass after_id from the last event to get only new events.",
        {
          connection: z.string().optional().describe("Connection alias to poll. Omit for all."),
          after_id: z.number().optional().describe("Return events with id > after_id. Omit for all buffered events."),
        },
        async (input) => {
          const proxy = getProxy(keyAlias);
          if (!proxy) return { content: [{ type: "text", text: "Proxy not configured" }] };
          const result = await proxy.callTool("poll_events", input);
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        },
      ),

      tool(
        "ingestor_status",
        "Get the status of all active ingestors. Shows connection state, " +
        "buffer sizes, event counts, and any errors.",
        {},
        async () => {
          const proxy = getProxy(keyAlias);
          if (!proxy) return { content: [{ type: "text", text: "Proxy not configured" }] };
          const result = await proxy.callTool("ingestor_status");
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        },
      ),
    ],
  });
}
```

### Injection Point in claude.ts

The proxy MCP server is injected for **all** sessions, before the agent-specific block:

```typescript
// In sendMessage(), after building plugin MCP servers but BEFORE the agent tools block:

const mcpServers: Record<string, any> = mcpOpts ? { ...mcpOpts.mcpServers } : {};
const allowedTools: string[] = mcpOpts ? [...mcpOpts.allowedTools] : [];

// ── Proxy tools: injected for ALL sessions ──
const settings = getAgentSettings();
if (settings.proxyMode && settings.mcpConfigDir) {
  // Determine key alias: agent's alias if available, otherwise default
  const proxyKeyAlias = opts.agentAlias
    ? (getAgent(opts.agentAlias)?.mcpKeyAlias ?? "default")
    : "default";

  try {
    const proxyServer = buildProxyToolsServer(proxyKeyAlias);
    if (proxyServer && proxyServer.type === "sdk" && proxyServer.instance) {
      mcpServers["mcp-proxy"] = proxyServer;
      allowedTools.push("mcp__mcp-proxy__*");
      log.info(`Injected proxy tools (mode=${settings.proxyMode}, alias=${proxyKeyAlias})`);
    }
  } catch (err: any) {
    log.error(`Failed to build proxy tools server: ${err.message}`);
  }
}

// ── Agent tools: injected only for agent sessions (existing code) ──
if (opts.agentAlias) {
  // ... existing agent tools injection ...
}
```

This replaces the external mcp-secure-proxy MCP server (stdio process) for both local and remote mode. The tools run in-process within the backend, and call either `LocalProxy` or `ProxyClient` depending on the configured mode.

**Key benefits:**
- Available in every chat session (regular and agent)
- No external stdio process to manage
- Single `LocalProxy` instance shared across all sessions (no duplicated ingestors)
- Same tool interface regardless of mode — Claude sees the same tools whether local or remote
- Tool names match the existing remote proxy tools (`secure_request`, `list_routes`, etc.)

### New Settings: `AgentSettings` Type Extension

```typescript
// shared/types/agentSettings.ts
export interface AgentSettings {
  /** Absolute path to .mcp-secure-proxy/ directory containing keys and config */
  mcpConfigDir?: string;

  /** Proxy mode: 'local' runs in-process, 'remote' connects to external server */
  proxyMode?: 'local' | 'remote';

  /** URL of the remote MCP secure proxy server (used in 'remote' mode only) */
  remoteServerUrl?: string;

  /** Admin key alias — the key used to provision new callers/connections on a remote server.
   *  Only relevant in 'remote' mode. Must be already registered as admin on the target server. */
  adminKeyAlias?: string;
}
```

Note: no `localServerPort` or `localServerAutoStart` needed — there's no server to start.

### Integration with Backend Startup

In `backend/src/index.ts`:

```typescript
import { LocalProxy } from "./services/local-proxy.js";

const settings = getAgentSettings();
if (settings.proxyMode === 'local' && settings.mcpConfigDir) {
  const localProxy = new LocalProxy(settings.mcpConfigDir, "default");
  await localProxy.start();  // starts ingestors in-process
  setLocalProxyInstance(localProxy);
}
```

---

## Part 3: Settings UI Enhancements

### Current State
- `AgentSettings.tsx` only has a text field for `mcpConfigDir` and displays discovered key aliases

### New Settings Page Layout

```
┌─────────────────────────────────────────────────────────┐
│  MCP Secure Proxy Settings                              │
│                                                         │
│  ┌─── Mode ───────────────────────────────────────────┐ │
│  │  ○ Local (runs in-process, no separate server)     │ │
│  │    Status: ● Active (2 ingestors running)          │ │
│  │                                                    │ │
│  │  ○ Remote (connect to external server)             │ │
│  │    Server URL: [https://proxy.example.com:9999]    │ │
│  │    Status: ● Connected                             │ │
│  └────────────────────────────────────────────────────┘ │
│                                                         │
│  ┌─── Keys Directory ────────────────────────────────┐  │
│  │  Config Directory: [/path/to/.mcp-secure-proxy/]  │  │
│  │  [Browse]                                          │  │
│  │                                                    │  │
│  │  Discovered Aliases:                               │  │
│  │    ✓ default  (signing ✓, exchange ✓)             │  │
│  │    ✓ agent-1  (signing ✓, exchange ✓)             │  │
│  │    [+ Generate New Key Alias]                     │  │
│  └────────────────────────────────────────────────────┘ │
│                                                         │
│  ┌─── Admin Key (remote mode only) ───────────────────┐ │
│  │  Admin Alias: [default ▼] (for provisioning)      │  │
│  │  This key is used to add new callers/connections   │  │
│  │  to the remote server.                             │  │
│  └────────────────────────────────────────────────────┘ │
│                                                         │
│  [Save Settings]                                        │
└─────────────────────────────────────────────────────────┘
```

### New Settings API Endpoints

Add to `backend/src/routes/agent-settings.ts`:

```
GET  /api/agent-settings/proxy-status       → { mode, ingestorCount, connections }
POST /api/agent-settings/generate-key       → { alias } → Generate new keypair
```

Note: no server start/stop/restart endpoints needed for local mode.

### Key Generation from UI

When user clicks "+ Generate New Key Alias":
1. Prompt for alias name (text input)
2. Call `POST /api/agent-settings/generate-key` with `{ alias: "my-alias" }`
3. Backend calls mcp-secure-proxy's `generateKeyBundle()` + `saveKeyBundle()` functions
4. **Local mode:** Copy public keys to peers dir, update `remote.config.json`, call `localProxy.reinitialize()`
5. **Remote mode:** Use admin key's ProxyClient to call `admin_register_caller` on remote server

---

## Part 4: Connection Management UI

### Concept

Users need to:
1. Browse available connection templates (23 built-in: Discord, GitHub, Stripe, etc.)
2. Enable/disable connections for a specific caller (key alias)
3. Provide required API keys/secrets for each connection
4. Have those secrets saved

### New Page: Connections Manager

New file: `frontend/src/pages/agents/ConnectionsManager.tsx`

Accessed from Agent Settings or as a top-level settings page.

```
┌────────────────────────────────────────────────────────────┐
│  Connection Manager                                        │
│                                                            │
│  Managing connections for alias: [default ▼]               │
│                                                            │
│  ┌─── Available Connections ──────────────────────────────┐│
│  │                                                        ││
│  │  ┌──────────────────────────────────────────────────┐ ││
│  │  │ 🐙 GitHub API                    [Enabled ✓]     │ ││
│  │  │ Access GitHub repos, issues, PRs                 │ ││
│  │  │ Required: GITHUB_TOKEN            [Set ✓]        │ ││
│  │  │ Optional: GITHUB_WEBHOOK_SECRET   [Not set]      │ ││
│  │  │ [Configure] [Docs ↗]                             │ ││
│  │  └──────────────────────────────────────────────────┘ ││
│  │                                                        ││
│  │  ┌──────────────────────────────────────────────────┐ ││
│  │  │ 🤖 Discord Bot                   [Disabled]      │ ││
│  │  │ Real-time Discord Gateway events                 │ ││
│  │  │ Required: DISCORD_BOT_TOKEN       [Not set]      │ ││
│  │  │ [Configure] [Docs ↗]                             │ ││
│  │  └──────────────────────────────────────────────────┘ ││
│  │                                                        ││
│  │  ... (23 templates + custom connectors)                ││
│  └────────────────────────────────────────────────────────┘│
│                                                            │
│  [+ Add Custom Connector]                                  │
└────────────────────────────────────────────────────────────┘
```

### Configure Modal (per connection)

When user clicks "Configure" on a connection:

```
┌─────────────────────────────────────────────┐
│  Configure: Discord Bot                      │
│                                              │
│  Connection Alias: discord-bot               │
│  Enabled: [✓]                                │
│                                              │
│  ── Required Secrets ──                      │
│  DISCORD_BOT_TOKEN: [••••••••••] [👁] [Set]  │
│                                              │
│  ── Ingestor Settings ──                     │
│  Type: WebSocket (Discord Gateway)           │
│  Intents: [3276799]                          │
│  Guild Filter: [guild-id-1, guild-id-2]      │
│  Channel Filter: [channel-id-1]              │
│  Event Filter: [MESSAGE_CREATE, ...]          │
│  Buffer Size: [200]                          │
│                                              │
│  [Save]  [Cancel]                            │
└─────────────────────────────────────────────┘
```

### Backend: Connection Management API

New file: `backend/src/routes/connections.ts`

```
GET  /api/connections/templates              → List all available connection templates
GET  /api/connections/templates/:alias       → Get single template details
GET  /api/connections/:callerAlias           → Get caller's enabled connections + secret status
POST /api/connections/:callerAlias/enable    → { connectionAlias } → Enable connection for caller
POST /api/connections/:callerAlias/disable   → { connectionAlias } → Disable connection for caller
POST /api/connections/:callerAlias/secrets   → { connectionAlias, secrets: { KEY: "value" } }
GET  /api/connections/:callerAlias/secret-status → Which secrets are set (never returns values!)
POST /api/connections/custom                 → Create custom connector definition
```

### How Secrets Get Saved

**Two approaches depending on mode:**

#### Local Mode (direct file access, in-process)

claude-code-ui has direct filesystem access to the config directory:

1. User provides `DISCORD_BOT_TOKEN=abc123` via UI
2. Backend writes/updates `.mcp-secure-proxy/.env` file
3. Backend updates `remote.config.json` to add/modify the caller's connections list
4. Backend calls `localProxy.reinitialize()` to pick up changes in-process (no restart needed)

Implementation in `backend/src/services/connection-manager.ts`:

```typescript
export class ConnectionManager {
  constructor(private mcpConfigDir: string, private localProxy: LocalProxy | null) {}

  /** Load all built-in connection templates */
  getTemplates(): ConnectionTemplate[] {
    // Import listConnectionTemplates() from mcp-secure-proxy/shared/connections
  }

  /** Enable a connection for a caller */
  async enableConnection(callerAlias: string, connectionAlias: string): Promise<void> {
    // 1. Load remote.config.json
    // 2. Add connectionAlias to callers[callerAlias].connections
    // 3. Save remote.config.json
    // 4. localProxy.reinitialize()  ← in-process, instant
  }

  /** Set secrets for a connection */
  async setSecrets(callerAlias: string, connectionAlias: string, secrets: Record<string, string>): Promise<void> {
    // 1. Load .env file
    // 2. For per-caller isolation: save as CALLALIAS_SECRETNAME=value
    // 3. Update caller's env mapping: { "SECRET_NAME": "${CALLALIAS_SECRETNAME}" }
    // 4. Save .env and remote.config.json
    // 5. localProxy.reinitialize()  ← in-process, instant
  }

  /** Check which secrets are set (without revealing values) */
  getSecretStatus(callerAlias: string, connectionAlias: string): Record<string, boolean> {
    // Read .env, check which required keys have values
  }
}
```

#### Remote Mode (via Admin API)

When connecting to an external remote server, we need an authenticated admin channel.

1. User provides `DISCORD_BOT_TOKEN=abc123` via UI
2. Backend uses the `adminKeyAlias` to establish an encrypted session with the remote server
3. Backend calls a new `admin_set_secrets` tool on the remote server
4. Remote server stores the secrets in its own .env or secrets store

This requires a new **Admin API** on the remote server (see mcp-secure-proxy plan).

The flow:
```
UI → claude-code-ui backend → ProxyClient(adminKeyAlias) → secure_request →
  remote server admin endpoint → writes to .env / config → returns restartRequired flag
```

New tool calls via ProxyClient:
```typescript
// In backend, using the admin key alias's ProxyClient:
const adminClient = getProxyClient(settings.adminKeyAlias);

// Set secrets for a caller
await adminClient.callTool("admin_set_secrets", {
  callerAlias: "agent-1",
  connectionAlias: "discord-bot",
  secrets: { DISCORD_BOT_TOKEN: "abc123" }
});

// Enable connection for a caller
await adminClient.callTool("admin_enable_connection", {
  callerAlias: "agent-1",
  connectionAlias: "discord-bot"
});

// Register a new caller
await adminClient.callTool("admin_register_caller", {
  callerAlias: "new-agent",
  name: "New Agent",
  signingPubPem: "...",
  exchangePubPem: "...",
  connections: ["github", "discord-bot"]
});
```

---

## Part 5: Key Provisioning — Adding New Aliases

### The Problem

In remote mode, authenticating with the server requires keypairs and a registered caller entry. In local mode, keys are still used as identity labels for per-caller secret isolation, but no cryptographic auth is needed.

### Flow: Provisioning a New Key Alias

```
┌─────────────────────────────────────────────────────────────┐
│  1. User clicks "+ Generate New Key Alias" in Settings UI   │
│  2. User enters alias name (e.g., "agent-2")                │
│  3. Backend generates Ed25519 + X25519 keypair locally       │
│     → saves to keys/local/agent-2/                          │
│  4. Backend reads the public keys (signing.pub.pem,          │
│     exchange.pub.pem) from the newly generated alias         │
│                                                              │
│  LOCAL MODE:                                                 │
│  5a. Copy public keys to keys/peers/agent-2/ in config dir  │
│  6a. Add caller entry to remote.config.json                  │
│  7a. localProxy.reinitialize()  ← instant, in-process        │
│                                                              │
│  REMOTE MODE:                                                │
│  5b. Use adminKeyAlias's ProxyClient to call                 │
│      admin_register_caller on remote server                  │
│  6b. Remote server stores public keys and adds caller entry  │
│  7b. Remote server returns restartRequired flag              │
│                                                              │
│  8. User can now assign this alias to agents                 │
└─────────────────────────────────────────────────────────────┘
```

### Backend Implementation

Add to `backend/src/services/key-manager.ts`:

```typescript
import { generateKeyBundle, saveKeyBundle, extractPublicKeys, fingerprint } from "mcp-secure-proxy/shared/crypto";

export class KeyManager {
  constructor(private mcpConfigDir: string) {}

  /** Generate a new local keypair for the given alias */
  async generateLocalKeys(alias: string): Promise<{ fingerprint: string }> {
    const targetDir = join(this.mcpConfigDir, "keys", "local", alias);
    if (existsSync(targetDir)) throw new Error(`Alias "${alias}" already exists`);

    const bundle = generateKeyBundle();
    saveKeyBundle(bundle, targetDir);
    const fp = fingerprint(extractPublicKeys(bundle));
    return { fingerprint: fp };
  }

  /** Register the alias as a caller */
  async registerCaller(alias: string, connections: string[]): Promise<void> {
    const settings = getAgentSettings();

    if (settings.proxyMode === 'local') {
      await this.registerLocalCaller(alias, connections);
    } else {
      await this.registerRemoteCaller(alias, connections);
    }
  }

  private async registerLocalCaller(alias: string, connections: string[]): Promise<void> {
    // 1. Copy public keys to peers directory
    const srcDir = join(this.mcpConfigDir, "keys", "local", alias);
    const dstDir = join(this.mcpConfigDir, "keys", "peers", alias);
    mkdirSync(dstDir, { recursive: true });
    copyFileSync(join(srcDir, "signing.pub.pem"), join(dstDir, "signing.pub.pem"));
    copyFileSync(join(srcDir, "exchange.pub.pem"), join(dstDir, "exchange.pub.pem"));

    // 2. Add caller entry to remote.config.json
    const config = loadRemoteConfig();
    config.callers[alias] = { peerKeyDir: dstDir, connections, env: {} };
    saveRemoteConfig(config);

    // 3. Reinitialize in-process — instant, no restart
    await getLocalProxyInstance().reinitialize();
  }

  private async registerRemoteCaller(alias: string, connections: string[]): Promise<void> {
    const adminClient = getProxyClient(settings.adminKeyAlias!);
    const pubKeys = readPublicKeys(alias);

    await adminClient.callTool("admin_register_caller", {
      callerAlias: alias,
      signingPubPem: pubKeys.signing,
      exchangePubPem: pubKeys.exchange,
      connections
    });
  }
}
```

---

## Part 6: First-Run Setup Flow

### Problem

New users have no keys, no config, and no understanding of the system. We need a guided setup.

### Setup Wizard (shown when mcpConfigDir is not set or has no keys)

```
┌─────────────────────────────────────────────────────────┐
│  MCP Secure Proxy Setup                                  │
│                                                          │
│  Step 1 of 3: Choose Mode                                │
│                                                          │
│  How would you like to run the secure proxy?             │
│                                                          │
│  ○ Local (Recommended for single-machine setups)         │
│    Runs in-process. All secrets stay on this machine.     │
│    No separate server needed. Perfect for personal use.   │
│                                                          │
│  ○ Remote (For team/distributed setups)                   │
│    Connect to an external MCP secure proxy server.        │
│    Requires server URL and pre-provisioned keys.          │
│                                                          │
│  [Next →]                                                │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  Step 2 of 3: Initialize                                 │
│                                                          │
│  Config Directory: [~/.mcp-secure-proxy/] [Browse]       │
│                                                          │
│  We'll create:                                           │
│  ✓ Default identity keypair (for your first agent)       │
│  ✓ Default configuration files                           │
│                                                          │
│  [Initialize →]                                          │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  Step 3 of 3: Enable Connections (Optional)              │
│                                                          │
│  Select services you'd like to connect:                  │
│                                                          │
│  ☐ GitHub — repos, issues, PRs                           │
│  ☐ Discord Bot — real-time Discord events                │
│  ☐ Slack — channels, messages                            │
│  ☐ OpenAI — chat completions, embeddings                 │
│  ☐ Anthropic — Claude API                                │
│  ... (show all 23)                                       │
│                                                          │
│  You can always add more connections later.               │
│                                                          │
│  [Finish Setup]                                          │
└─────────────────────────────────────────────────────────┘
```

### Backend: Setup API

```
POST /api/agent-settings/setup/initialize  → Create config dir, generate keys, write configs
GET  /api/agent-settings/setup/status      → Check if setup is complete
```

---

## Part 7: File Changes Summary

### New Files

| File | Purpose |
|------|---------|
| `backend/src/services/local-proxy.ts` | In-process proxy — imports core logic from mcp-secure-proxy, same `callTool()` interface |
| `backend/src/services/proxy-tools.ts` | SDK-based MCP server exposing proxy tools to ALL chat sessions |
| `backend/src/services/connection-manager.ts` | Connection template loading, enable/disable, secret management |
| `backend/src/services/key-manager.ts` | Key generation, provisioning, registration |
| `backend/src/routes/connections.ts` | REST API for connection management |
| `frontend/src/pages/agents/ConnectionsManager.tsx` | Connection management UI page |
| `frontend/src/pages/agents/SetupWizard.tsx` | First-run setup wizard |
| `frontend/src/components/ConnectionCard.tsx` | Individual connection display/config component |
| `frontend/src/components/ConfigureConnectionModal.tsx` | Secret entry + ingestor config modal |

### Modified Files

| File | Changes |
|------|---------|
| `backend/package.json` | Add `mcp-secure-proxy` file dependency |
| `shared/types/agentSettings.ts` | Extend `AgentSettings` with proxy mode, URL, admin alias |
| `backend/src/services/agent-settings.ts` | Handle new settings fields, setup initialization |
| `backend/src/services/proxy-singleton.ts` | Return `LocalProxy` or `ProxyClient` based on mode |
| `backend/src/services/claude.ts` | Inject proxy MCP server (`mcp-proxy`) for ALL sessions before agent tools block |
| `backend/src/routes/agent-settings.ts` | New endpoints for key generation, setup, proxy status |
| `backend/src/index.ts` | Initialize `LocalProxy` on boot if local mode, mount webhook route |
| `frontend/src/api.ts` | New API functions for connections, setup |
| `frontend/src/pages/agents/AgentSettings.tsx` | Expand with mode toggle, status display |

### Deleted/Deprecated Files (after migration)

| File | Reason |
|------|--------|
| `backend/src/services/proxy-client.ts` | Replace with import from mcp-secure-proxy package |

---

## Part 8: Migration Path

### Phase 1: Package Dependency + LocalProxy + Proxy MCP Server
1. Add `file:` dependency to backend/package.json, run `npm install`
2. Build `LocalProxy` class (imports core logic from mcp-secure-proxy)
3. Update proxy-singleton to return `LocalProxy` or `ProxyClient` based on mode
4. Extend settings with proxy mode toggle
5. Mount webhook route on Express for local mode
6. Build `proxy-tools.ts` — SDK-based MCP server with proxy tools
7. Inject proxy MCP server in `claude.ts` for ALL sessions (before agent tools block)

### Phase 2: Connection Management
1. Build `ConnectionManager` service
2. Build connection templates API
3. Build connections UI page
4. Implement local-mode secret writing (direct .env + `reinitialize()`)

### Phase 3: Remote Mode + Admin API
1. Implement admin tool handlers on mcp-secure-proxy (see other plan)
2. Build `KeyManager` service
3. Implement remote-mode provisioning via admin API
4. Build key generation UI
5. Build setup wizard

### Phase 4: Replace Vendored Code
1. Switch imports from vendored `proxy-client.ts` to mcp-secure-proxy package
2. Ensure `exports` map in mcp-secure-proxy's package.json is complete
3. Remove vendored proxy-client.ts
4. Update all import paths

---

## Security Considerations

1. **Secret Display**: UI should NEVER show secret values after they're set. Only show "Set ✓" / "Not set" status.
2. **API Key Transmission**: In remote mode, secrets travel browser → backend (HTTPS in prod) → encrypted channel → remote server. In local mode, secrets go browser → backend (HTTPS in prod) → direct .env write. Never stored in browser.
3. **Admin Key Protection**: The admin key alias has elevated permissions (remote mode only). Its use should be clearly indicated and limited to settings/provisioning operations.
4. **Local Mode .env**: When writing secrets to .env files in local mode, ensure file permissions are 0600.
5. **No Secret Logging**: Never log secret values. Log secret names and operations only.
