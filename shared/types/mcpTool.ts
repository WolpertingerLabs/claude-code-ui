/**
 * MCP Tool definitions exposed to the frontend for display in the chat UI.
 */

export interface McpToolParameter {
  name: string;
  type: string; // "string" | "number" | "boolean" | "enum" | "object" | "array"
  description?: string;
  required: boolean;
  enumValues?: string[];
}

export interface McpToolDefinition {
  /** Tool name, e.g. "render_file" */
  name: string;
  /** Qualified MCP name, e.g. "mcp__callboard-tools__render_file" */
  qualifiedName: string;
  /** Human-readable description */
  description: string;
  /** Parameter definitions */
  parameters: McpToolParameter[];
  /** MCP server name, e.g. "callboard-tools" */
  serverName: string;
  /** Human-readable label, e.g. "Callboard Tools" */
  serverLabel: string;
  /** Category for grouping and badge coloring */
  category: "platform" | "proxy" | "agent" | "external";
}

export interface McpToolServerInfo {
  name: string;
  label: string;
  category: "platform" | "proxy" | "agent" | "external";
  toolCount: number;
  enabled: boolean;
}

export interface McpToolsResponse {
  tools: McpToolDefinition[];
  servers: McpToolServerInfo[];
}
