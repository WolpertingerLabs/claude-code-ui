# Plan: render_file — Callboard MCP Tools

A new MCP tool server (`callboard-tools`) injected into **all** chat sessions (regular + agent) that gives Claude the ability to render media files inline in the chat UI. The first tool is `render_file`, which displays images, audio, video, and PDFs.

---

## Why This Matters

Today, when Claude reads a file, the user sees raw tool output — JSON blobs, text dumps, or nothing at all. If Claude analyzes an image, generates a chart, or references a PDF, the user has to open the file separately to see what Claude is talking about. The conversation becomes disjointed.

`render_file` lets Claude **show** things to the user. When Claude reads a screenshot, it can display it. When it generates audio or finds a relevant PDF, it can embed it right in the conversation. The chat becomes a richer surface — not just text, but a shared workspace where both parties can see the same things.

This is also the foundation for a broader `callboard-tools` MCP server — platform-level tools that enhance the chat experience for all sessions, distinct from the agent-only orchestration tools (`mcp__callboard__*`).

---

## Architecture Overview

```
LLM calls render_file(file_path, display_mode, caption)
    │
    ▼
Backend MCP tool handler (callboard-tools.ts)
    │  validates path, determines MIME type
    │  returns lightweight JSON metadata (NOT file content)
    ▼
Tool result stored in session JSONL log (~200 bytes)
    │
    ▼
Frontend ToolCallBubble detects tool name
    │  delegates to MediaRenderer instead of generic tool UI
    ▼
MediaRenderer fetches file from GET /api/files/serve?path=...
    │  renders image/audio/video/PDF based on media_type
    ▼
User sees the media inline in the chat
```

**Key design decision:** The tool result contains only metadata, not file content. A 1MB image would become ~1.3MB of base64 text in the session log and context window. Instead, the frontend fetches the file on-demand from a dedicated serving endpoint.

---

## Tool Design

### `render_file`

**Inputs:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `file_path` | string | yes | Absolute path to the file |
| `display_mode` | `"inline"` \| `"fullscreen"` | no (default: `"inline"`) | How to display the media |
| `caption` | string | no | Caption/description shown below the media |

**Tool result (metadata only):**

```json
{
  "type": "render_file",
  "file_path": "/Users/me/project/screenshot.png",
  "media_type": "image",
  "mime_type": "image/png",
  "display_mode": "inline",
  "file_size": 123456,
  "caption": "Screenshot of the updated UI"
}
```

**Supported media types:**

| Category | Extensions / MIME types |
|----------|----------------------|
| Image | png, jpeg/jpg, gif, webp, svg, bmp |
| Audio | mp3, wav, ogg, aac, flac, webm |
| Video | mp4, webm, ogg, mov (quicktime) |
| PDF | application/pdf |

---

## Implementation

### New Files

| File | Purpose |
|------|---------|
| `backend/src/services/callboard-tools.ts` | MCP server with `render_file` tool definition |
| `backend/src/routes/files.ts` | Express router: `GET /api/files/serve` |
| `frontend/src/components/MediaRenderer.tsx` | React component to render all media types |

### Modified Files

| File | Change |
|------|--------|
| `backend/src/services/claude.ts` | Import + inject `callboard-tools` into all sessions; add to `categorizeToolPermission()` as `fileRead` |
| `backend/src/index.ts` | Register `filesRouter` at `/api/files` |
| `frontend/src/components/ToolCallBubble.tsx` | Detect `mcp__callboard-tools__render_file`, render `MediaRenderer` instead of generic tool UI |
| `frontend/src/components/MessageBubble.tsx` | Add `render_file` case to `getToolSummary()` |

---

### 1. Backend: `callboard-tools.ts`

New in-process MCP server following the exact pattern of `proxy-tools.ts`. Uses `createSdkMcpServer()` and `tool()` from `@anthropic-ai/claude-agent-sdk`.

```typescript
import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { existsSync, statSync } from "fs";
import path from "path";

const MIME_MAP: Record<string, { mime: string; category: string }> = {
  ".png":  { mime: "image/png",       category: "image" },
  ".jpg":  { mime: "image/jpeg",      category: "image" },
  ".jpeg": { mime: "image/jpeg",      category: "image" },
  ".gif":  { mime: "image/gif",       category: "image" },
  ".webp": { mime: "image/webp",      category: "image" },
  ".svg":  { mime: "image/svg+xml",   category: "image" },
  ".bmp":  { mime: "image/bmp",       category: "image" },
  ".mp3":  { mime: "audio/mpeg",      category: "audio" },
  ".wav":  { mime: "audio/wav",       category: "audio" },
  ".ogg":  { mime: "audio/ogg",       category: "audio" },
  ".aac":  { mime: "audio/aac",       category: "audio" },
  ".flac": { mime: "audio/flac",      category: "audio" },
  ".mp4":  { mime: "video/mp4",       category: "video" },
  ".webm": { mime: "video/webm",      category: "video" },
  ".mov":  { mime: "video/quicktime", category: "video" },
  ".pdf":  { mime: "application/pdf", category: "pdf"   },
};

export function buildCallboardToolsServer() {
  return createSdkMcpServer({
    name: "callboard-tools",
    version: "1.0.0",
    tools: [
      tool(
        "render_file",
        "Render a file in the chat UI. Supports images, audio, video, and PDFs. Use this when the user would benefit from seeing a file rather than just hearing about it. Requires an absolute file path.",
        {
          file_path: z.string().describe("Absolute path to the file to render"),
          display_mode: z.enum(["inline", "fullscreen"]).optional()
            .describe("inline = compact view in chat flow; fullscreen = expanded modal view (default: inline)"),
          caption: z.string().optional()
            .describe("Optional caption shown below the rendered file"),
        },
        async (args) => {
          // 1. Validate absolute path
          if (!path.isAbsolute(args.file_path)) {
            return error("file_path must be an absolute path");
          }
          if (args.file_path.includes("\0")) {
            return error("Invalid file path");
          }

          // 2. Resolve and check existence
          const resolved = path.resolve(args.file_path);
          if (!existsSync(resolved)) {
            return error(`File not found: ${resolved}`);
          }

          // 3. Determine media type
          const ext = path.extname(resolved).toLowerCase();
          const info = MIME_MAP[ext];
          if (!info) {
            return error(`Unsupported file type: ${ext}`);
          }

          // 4. Get file size
          const stat = statSync(resolved);
          if (!stat.isFile()) {
            return error("Path is not a regular file");
          }

          const MAX_SIZE = 100 * 1024 * 1024; // 100MB
          if (stat.size > MAX_SIZE) {
            return error(`File too large (${(stat.size / 1024 / 1024).toFixed(1)}MB, max 100MB)`);
          }

          // 5. Return metadata
          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({
                type: "render_file",
                file_path: resolved,
                media_type: info.category,
                mime_type: info.mime,
                display_mode: args.display_mode || "inline",
                file_size: stat.size,
                caption: args.caption || undefined,
              }),
            }],
          };
        },
      ),
    ],
  });
}

function error(message: string) {
  return { content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }] };
}
```

---

### 2. Backend: `files.ts` route

Secure file-serving endpoint that streams media files to the frontend.

```typescript
import { Router } from "express";
import { existsSync, realpathSync, statSync, createReadStream } from "fs";
import path from "path";

const ALLOWED_MIME: Record<string, string> = { /* same map as above */ };
const MAX_SERVE_SIZE = 100 * 1024 * 1024;

router.get("/serve", (req, res) => {
  const filePath = req.query.path as string;

  // Validate: absolute, no null bytes
  // Resolve: path.resolve() + realpathSync() to collapse traversal & symlinks
  // Check: existsSync, isFile, size < MAX_SERVE_SIZE
  // MIME: lookup from extension, reject if not in allowlist
  // Headers: Content-Type, Content-Disposition: inline, X-Content-Type-Options: nosniff
  // Stream: fs.createReadStream() piped to res
});
```

**Security measures:**
- Auth required (inherits global `requireAuth` middleware)
- `path.resolve()` + `realpathSync()` — prevents `..` traversal and symlink attacks
- Null byte rejection
- MIME type allowlist — only serves recognized media types
- 100MB file size cap
- `X-Content-Type-Options: nosniff`
- Streamed response (no full file buffering)

---

### 3. Backend: `claude.ts` injection

After the existing proxy tools injection block and before the agent tools block:

```typescript
import { buildCallboardToolsServer } from "./callboard-tools.js";

// In sendMessage(), after proxy tools injection:
try {
  const callboardToolsServer = buildCallboardToolsServer();
  if (callboardToolsServer?.type === "sdk" && callboardToolsServer.instance) {
    mcpServers["callboard-tools"] = callboardToolsServer;
    allowedTools.push("mcp__callboard-tools__*");
  }
} catch (err: any) {
  log.error(`Failed to build callboard-tools server: ${err.message}`);
}
```

In `categorizeToolPermission()`:

```typescript
if (toolName === "mcp__callboard-tools__render_file") {
  return "fileRead";
}
```

**Naming:** The server key is `"callboard-tools"` (producing `mcp__callboard-tools__*`), avoiding collision with the existing agent tools key `"callboard"` (`mcp__callboard__*`).

---

### 4. Backend: `index.ts` route registration

```typescript
import { filesRouter } from "./routes/files.js";
app.use("/api/files", filesRouter);
```

---

### 5. Frontend: `MediaRenderer.tsx`

```typescript
interface RenderFileData {
  type: "render_file";
  file_path: string;
  media_type: "image" | "audio" | "video" | "pdf";
  mime_type: string;
  display_mode: "inline" | "fullscreen";
  file_size: number;
  caption?: string;
}
```

Builds a URL: `/api/files/serve?path=${encodeURIComponent(data.file_path)}`

**Rendering by media type:**

| Type | Inline | Fullscreen / Click-to-expand |
|------|--------|------------------------------|
| **Image** | `<img>` with `max-height: 400px`, `max-width: 100%`, clickable | Modal overlay with full-size image |
| **Audio** | `<audio controls>` in a compact card with filename + size | Same (audio doesn't benefit from fullscreen) |
| **Video** | `<video controls preload="metadata">` max-height 400px | Modal overlay with larger player |
| **PDF** | `<iframe>` ~500px tall | Modal overlay with larger iframe |

**Common wrapper styling (all CSS variables, no hardcoded colors):**
- `border: 1px solid var(--border)`
- `border-radius: var(--radius)`
- `background: var(--surface)`
- Caption: `color: var(--text-muted)`, `font-size: 12px`
- File name + formatted size as metadata line
- Loading skeleton while the file loads
- Error fallback if the file fails to load

**Fullscreen modal:** Uses the same overlay pattern as `ModalOverlay.tsx` — `var(--overlay-bg)`, close on Escape or click-outside, close button top-right.

---

### 6. Frontend: `ToolCallBubble.tsx`

Detect the tool name early in the component and short-circuit to `MediaRenderer`:

```tsx
const renderFileResult = useMemo(() => {
  if (toolUse.toolName === "mcp__callboard-tools__render_file" && toolResult) {
    try {
      return JSON.parse(toolResult.content);
    } catch {
      return null;
    }
  }
  return null;
}, [toolUse, toolResult]);

if (renderFileResult?.type === "render_file") {
  return <MediaRenderer data={renderFileResult} />;
}
```

---

### 7. Frontend: `MessageBubble.tsx`

Add a case to `getToolSummary()` for the collapsed tool display:

```typescript
case "mcp__callboard-tools__render_file": {
  const fileName = input.file_path?.split("/").pop();
  return fileName ? ` - ${fileName}` : "";
}
```

---

## Implementation Order

1. `backend/src/services/callboard-tools.ts` — MCP server + tool
2. `backend/src/routes/files.ts` — file serving endpoint
3. `backend/src/services/claude.ts` — inject into sessions + permissions
4. `backend/src/index.ts` — register route
5. `frontend/src/components/MediaRenderer.tsx` — rendering component
6. `frontend/src/components/ToolCallBubble.tsx` — detection + delegation
7. `frontend/src/components/MessageBubble.tsx` — tool summary

---

## Future Tools for `callboard-tools`

The `callboard-tools` server is designed to grow. Potential future tools:

- **`render_chart`** — render data as a chart (bar, line, pie) using a charting library
- **`render_diff`** — render a side-by-side or unified diff view
- **`render_table`** — render structured data as an interactive table
- **`render_markdown`** — render rich markdown with embedded media
- **`notify_user`** — send a browser notification or sound alert
- **`open_url`** — open a URL in the user's browser
