export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface CronJob {
  id: string;
  name: string;
  schedule: string;
  type: "one-off" | "recurring" | "indefinite";
  status: "active" | "paused" | "completed";
  lastRun?: number;
  nextRun?: number;
  description: string;
}

export interface Connection {
  id: string;
  service: string;
  type: "bot" | "api" | "oauth";
  status: "connected" | "disconnected" | "error";
  connectedAt?: number;
  description: string;
}

export interface Trigger {
  id: string;
  name: string;
  source: string;
  event: string;
  condition?: string;
  status: "active" | "paused";
  lastTriggered?: number;
  description: string;
}

export interface ActivityEntry {
  id: string;
  type: "chat" | "trigger" | "cron" | "connection" | "system";
  message: string;
  timestamp: number;
}

export interface MemoryItem {
  id: string;
  key: string;
  value: string;
  category: "fact" | "preference" | "context" | "instruction";
  updatedAt: number;
}
