import type { DefaultPermissions } from "./permissions.js";

export interface QueueItem {
  id: string;
  chat_id: string | null;
  user_message: string;
  status: "draft";
  created_at: string;
  // New chat fields - only used when chat_id is null
  folder?: string;
  defaultPermissions?: DefaultPermissions;
}
