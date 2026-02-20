import { existsSync, readFileSync, copyFileSync, mkdirSync } from "fs";
import { join } from "path";
import type { AgentConfig } from "shared";

const SCAFFOLD_DIR = join(process.cwd(), "backend", "src", "scaffold");

const SCAFFOLD_FILES = ["AGENTS.md", "SOUL.md", "USER.md", "TOOLS.md", "HEARTBEAT.md", "MEMORY.md"];

/**
 * Compile the agent's identity and user context into a markdown string
 * suitable for appending to the Claude Code preset system prompt.
 *
 * Returns an empty string if the config has no meaningful identity data.
 */
export function compileIdentityPrompt(config: AgentConfig): string {
  const sections: string[] = [];

  // --- Identity section ---
  const identityLines: string[] = [];

  const nameDisplay = [config.name, config.emoji].filter(Boolean).join(" ");
  if (nameDisplay) identityLines.push(`- **Name:** ${nameDisplay}`);
  if (config.role) identityLines.push(`- **Role:** ${config.role}`);
  if (config.personality) identityLines.push(`- **Personality:** ${config.personality}`);
  if (config.tone) identityLines.push(`- **Tone:** ${config.tone}`);
  if (config.pronouns) identityLines.push(`- **Pronouns:** ${config.pronouns}`);
  if (config.languages && config.languages.length > 0) {
    identityLines.push(`- **Languages:** ${config.languages.join(", ")}`);
  }

  if (identityLines.length > 0) {
    sections.push(`# Agent Identity\n\n${identityLines.join("\n")}`);
  }

  // --- User context section ---
  const userLines: string[] = [];

  if (config.userName) userLines.push(`- **Name:** ${config.userName}`);
  if (config.userTimezone) userLines.push(`- **Timezone:** ${config.userTimezone}`);
  if (config.userLocation) userLines.push(`- **Location:** ${config.userLocation}`);

  if (userLines.length > 0 || config.userContext) {
    let userSection = `## Your Human\n\n${userLines.join("\n")}`;
    if (config.userContext) {
      userSection += `\n\n${config.userContext}`;
    }
    sections.push(userSection);
  }

  // --- Guidelines section ---
  if (config.guidelines && config.guidelines.length > 0) {
    const guidelineLines = config.guidelines.map((g) => `- ${g}`).join("\n");
    sections.push(`## Guidelines\n\n${guidelineLines}`);
  }

  return sections.join("\n\n");
}

/**
 * Scaffold a new agent workspace with template files.
 * Copies scaffold files into the workspace, creates CLAUDE.md from AGENTS.md,
 * and creates the memory/ subdirectory.
 *
 * Skips files that already exist in the workspace.
 */
export function scaffoldWorkspace(workspacePath: string): void {
  // Copy scaffold template files
  for (const file of SCAFFOLD_FILES) {
    const src = join(SCAFFOLD_DIR, file);
    const dest = join(workspacePath, file);
    if (existsSync(src) && !existsSync(dest)) {
      copyFileSync(src, dest);
    }
  }

  // Copy AGENTS.md as CLAUDE.md (the SDK-loaded behavioral protocol)
  const agentsSrc = join(SCAFFOLD_DIR, "AGENTS.md");
  const claudeDest = join(workspacePath, "CLAUDE.md");
  if (existsSync(agentsSrc) && !existsSync(claudeDest)) {
    copyFileSync(agentsSrc, claudeDest);
  }

  // Create memory subdirectory
  const memoryDir = join(workspacePath, "memory");
  if (!existsSync(memoryDir)) {
    mkdirSync(memoryDir, { recursive: true });
  }
}

/**
 * Read a workspace file if it exists. Returns undefined if not found.
 */
export function readWorkspaceFile(workspacePath: string, filename: string): string | undefined {
  const filePath = join(workspacePath, filename);
  if (!existsSync(filePath)) return undefined;
  return readFileSync(filePath, "utf-8");
}
