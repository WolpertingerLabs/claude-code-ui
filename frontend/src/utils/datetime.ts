/**
 * Get the minimum allowed datetime-local value (1 minute from now).
 * Used by schedule/draft modals to prevent scheduling in the past.
 */
export function getMinDateTime(): string {
  const now = new Date();
  now.setMinutes(now.getMinutes() + 1);
  return now.toISOString().slice(0, 16);
}
