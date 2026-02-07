/**
 * Read/write the set of active plugin IDs from localStorage.
 *
 * Shared between SlashCommandsModal and Chat.tsx to keep plugin
 * activation state consistent.
 */

const STORAGE_KEY = "activePlugins";

/**
 * Load active plugin IDs from localStorage.
 */
export function getActivePlugins(): Set<string> {
  try {
    const active = localStorage.getItem(STORAGE_KEY);
    return new Set(active ? JSON.parse(active) : []);
  } catch {
    return new Set();
  }
}

/**
 * Persist active plugin IDs to localStorage.
 */
export function setActivePlugins(activeIds: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(activeIds)));
  } catch {
    // Handle localStorage errors gracefully
  }
}
