import { Router } from "express";
import { sessionRegistry } from "../services/session-registry.js";
export const sessionsRouter = Router();

/**
 * GET /api/sessions/poll — Lightweight polling endpoint for session activity.
 *
 * Accepts optional query params:
 *   - v:  client's last-known session version
 *   - mv: client's last-known metadata version
 *
 * Returns:
 *   - version / metadataVersion always (so client can track)
 *   - sessions included only when version differs from client's `v`
 *   - activeSummons included only when metadataVersion differs from client's `mv`
 *
 * When nothing has changed, the response is ~40 bytes of JSON.
 */
sessionsRouter.get("/poll", (_req, res) => {
  // #swagger.tags = ['Sessions']
  // #swagger.summary = 'Poll for session activity changes'
  // #swagger.description = 'Lightweight polling endpoint. Returns current version counters and optionally sessions/summons when they have changed since the client last polled.'
  /* #swagger.parameters['v'] = { in: 'query', required: false, type: 'integer', description: 'Client last-known session version' } */
  /* #swagger.parameters['mv'] = { in: 'query', required: false, type: 'integer', description: 'Client last-known metadata version' } */
  /* #swagger.responses[200] = { description: "Poll result with version counters and optional sessions/summons payloads" } */
  const clientVersion = _req.query.v !== undefined ? Number(_req.query.v) : undefined;
  const clientMetaVersion = _req.query.mv !== undefined ? Number(_req.query.mv) : undefined;

  const result: Record<string, unknown> = {
    version: sessionRegistry.version,
    metadataVersion: sessionRegistry.metadataVersion,
  };

  // Include sessions only when version changed (or first poll)
  if (clientVersion === undefined || clientVersion !== sessionRegistry.version) {
    result.sessions = sessionRegistry.getAll();
  }

  // Include active summons only when metadata version changed (or first poll)
  if (clientMetaVersion === undefined || clientMetaVersion !== sessionRegistry.metadataVersion) {
    const summons: Record<string, unknown> = {};
    for (const [chatId, info] of sessionRegistry.activeSummons) {
      summons[chatId] = info;
    }
    result.activeSummons = summons;
  }

  res.json(result);
});

/**
 * GET /api/sessions/active — REST snapshot of all active sessions.
 *
 * Returns the same data as the initial poll. Useful for debugging
 * or as a fallback when polling isn't appropriate.
 */
sessionsRouter.get("/active", (_req, res) => {
  // #swagger.tags = ['Sessions']
  // #swagger.summary = 'Get all active sessions'
  // #swagger.description = 'Returns a snapshot of all currently active sessions with their type and start time.'
  /* #swagger.responses[200] = { description: "Map of chatId to session info" } */
  res.json(sessionRegistry.getAll());
});
