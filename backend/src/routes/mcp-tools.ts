/**
 * MCP Tools API — Exposes tool definitions for frontend display.
 *
 * GET /api/mcp-tools          — All known tools
 * GET /api/mcp-tools?context=chat  — Only tools available in regular chats
 * GET /api/mcp-tools?context=agent — All tools including agent-only tools
 */
import { Router } from "express";
import { getMcpToolsManifest } from "../services/mcp-tool-registry.js";

export const mcpToolsRouter = Router();

mcpToolsRouter.get("/", (_req, res) => {
  try {
    const context = _req.query.context as "chat" | "agent" | undefined;
    const manifest = getMcpToolsManifest(context);
    res.json(manifest);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to get MCP tools" });
  }
});
