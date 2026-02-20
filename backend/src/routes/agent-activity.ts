import { Router } from "express";
import type { Request, Response } from "express";
import { agentExists } from "../services/agent-file-service.js";
import { getActivity, appendActivity } from "../services/agent-activity.js";
import type { ActivityEntry } from "shared";

export const agentActivityRouter = Router({ mergeParams: true });

/** GET /api/agents/:alias/activity — list activity entries with optional type filter */
agentActivityRouter.get("/", (req: Request, res: Response): void => {
  const alias = req.params.alias as string;

  if (!agentExists(alias)) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  const type = req.query.type as ActivityEntry["type"] | undefined;
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
  const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

  const validTypes = ["chat", "event", "cron", "connection", "system"];
  if (type && !validTypes.includes(type)) {
    res.status(400).json({ error: `type must be one of: ${validTypes.join(", ")}` });
    return;
  }

  const entries = getActivity(alias, { type, limit, offset });
  res.json({ entries });
});

/** POST /api/agents/:alias/activity — append a new activity entry */
agentActivityRouter.post("/", (req: Request, res: Response): void => {
  const alias = req.params.alias as string;

  if (!agentExists(alias)) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  const { type, message, metadata } = req.body as Partial<ActivityEntry>;

  if (!type || !message) {
    res.status(400).json({ error: "type and message are required" });
    return;
  }

  const validTypes = ["chat", "event", "cron", "connection", "system"];
  if (!validTypes.includes(type)) {
    res.status(400).json({ error: `type must be one of: ${validTypes.join(", ")}` });
    return;
  }

  const entry = appendActivity(alias, { type, message, metadata });
  res.status(201).json({ entry });
});
