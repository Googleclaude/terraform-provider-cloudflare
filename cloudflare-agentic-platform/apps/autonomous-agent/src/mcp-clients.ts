/**
 * Clients MCP que o agente usa:
 *  - opsMcp: nosso server (operações curadas, com audit)
 *  - cfMcp:  oficial Cloudflare em Code Mode (escape hatch para 2.500+ endpoints)
 *
 * v1: clients leves baseados em fetch ao endpoint /mcp.
 * Roadmap: usar @modelcontextprotocol/sdk client com auth flow completo.
 */
export interface McpClient {
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
}

export function opsMcpClient(env: Env): McpClient {
  return {
    async callTool(name, args) {
      const res = await fetch(env.MCP_OPS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(env.MCP_OPS_TOKEN ? { Authorization: `Bearer ${env.MCP_OPS_TOKEN}` } : {}),
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: crypto.randomUUID(),
          method: "tools/call",
          params: { name, arguments: args },
        }),
      });
      return res.json();
    },
  };
}

export function cfMcpClient(env: Env): McpClient {
  return {
    async callTool(name, args) {
      const res = await fetch(env.MCP_CF_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: crypto.randomUUID(),
          method: "tools/call",
          params: { name, arguments: args },
        }),
      });
      return res.json();
    },
  };
}
