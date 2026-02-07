/**
 * Descriptions for common Claude Code slash commands.
 *
 * Used by SlashCommandAutocomplete and SlashCommandsModal.
 * Keys are command names WITHOUT the leading "/" prefix.
 */
const COMMAND_DESCRIPTIONS: Record<string, string> = {
  compact: "Switch to compact view mode",
  context: "Show context information",
  cost: "Display API usage costs",
  init: "Initialize a new project or workspace",
  "output-style:new": "Create a new output style",
  "pr-comments": "Generate pull request review comments",
  "release-notes": "Generate release notes from git history",
  todos: "Show or manage todo items",
  review: "Review code changes",
  "security-review": "Perform security review of code",
  help: "Show help information",
  clear: "Clear the conversation",
  model: "Switch AI model",
};

/**
 * Get a human-readable description for a slash command.
 *
 * Accepts command names with or without the leading "/".
 * Returns `null` if no description is available.
 */
export function getCommandDescription(command: string): string | null {
  const key = command.startsWith("/") ? command.slice(1) : command;
  return COMMAND_DESCRIPTIONS[key] ?? null;
}

/**
 * Categorize a slash command for grouping in the UI.
 */
export function getCommandCategory(command: string): string {
  if (["pr-comments", "release-notes", "review", "security-review"].includes(command)) {
    return "Development";
  }
  if (["compact", "output-style:new", "help", "clear", "model"].includes(command)) {
    return "Interface";
  }
  if (["context", "cost", "todos"].includes(command)) {
    return "Information";
  }
  if (["init"].includes(command)) {
    return "Project";
  }
  return "Other";
}
