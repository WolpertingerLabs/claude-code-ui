import { Router } from "express";
import type { Request, Response } from "express";
import type { AgentConfig } from "shared";
import { createAgent, listAgents, getAgent, deleteAgent, agentExists, isValidAlias } from "../services/agent-file-service.js";

export const agentsRouter = Router();

agentsRouter.get("/", (_req: Request, res: Response): void => {
  const agents = listAgents();
  res.json({ agents });
});

agentsRouter.post("/", (req: Request, res: Response): void => {
  const { name, alias, description, systemPrompt } = req.body as Partial<AgentConfig>;

  if (!name || !alias || !description) {
    res.status(400).json({ error: "Name, alias, and description are required" });
    return;
  }

  if (typeof name !== "string" || name.trim().length === 0 || name.length > 128) {
    res.status(400).json({ error: "Name must be 1-128 characters" });
    return;
  }

  if (!isValidAlias(alias)) {
    res.status(400).json({
      error: "Alias must be 2-64 characters: lowercase letters, numbers, hyphens, underscores. Must start with a letter or number.",
    });
    return;
  }

  if (typeof description !== "string" || description.trim().length === 0 || description.length > 512) {
    res.status(400).json({ error: "Description must be 1-512 characters" });
    return;
  }

  if (systemPrompt !== undefined && systemPrompt !== null && typeof systemPrompt !== "string") {
    res.status(400).json({ error: "System prompt must be a string" });
    return;
  }

  if (agentExists(alias)) {
    res.status(409).json({ error: `An agent with alias "${alias}" already exists` });
    return;
  }

  const config: AgentConfig = {
    name: name.trim(),
    alias: alias.trim(),
    description: description.trim(),
    systemPrompt: systemPrompt?.trim() || undefined,
    createdAt: Date.now(),
  };

  createAgent(config);
  res.status(201).json({ agent: config });
});

agentsRouter.get("/:alias", (req: Request, res: Response): void => {
  const alias = req.params.alias as string;
  const agent = getAgent(alias);

  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  res.json({ agent });
});

agentsRouter.delete("/:alias", (req: Request, res: Response): void => {
  const alias = req.params.alias as string;
  const deleted = deleteAgent(alias);

  if (!deleted) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  res.json({ ok: true });
});
