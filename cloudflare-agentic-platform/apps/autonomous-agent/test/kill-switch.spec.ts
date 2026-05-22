import { describe, it, expect, vi } from "vitest";
import { isPaused, dispatchCron, KILL_SWITCH_KEY } from "../src/triggers/cron";

const mockKv = (value: string | null) => ({
  get: vi.fn().mockResolvedValue(value),
} as unknown as KVNamespace);

const baseEnv = {
  HOSTS_TO_CHECK: "https://example.com",
  MCP_OPS_URL: "https://mcp.local/mcp",
  MCP_CF_URL: "https://api.mcp.cloudflare.com/mcp",
  GITHUB_OWNER: "TODO_REPLACE_WITH_OWNER",
  GITHUB_REPO: "TODO_REPLACE_WITH_REPO",
  DNS_ZONE_ID: "TODO_REPLACE_WITH_ZONE_ID",
} as Partial<Env>;

describe("kill switch", () => {
  it("isPaused retorna false quando KV está vazio", async () => {
    const env = { ...baseEnv, OAUTH_KV: mockKv(null) } as Env;
    expect(await isPaused(env)).toBe(false);
  });

  it("isPaused retorna true quando flag paused=true", async () => {
    const env = { ...baseEnv, OAUTH_KV: mockKv(JSON.stringify({ paused: true })) } as Env;
    expect(await isPaused(env)).toBe(true);
  });

  it("isPaused trata JSON malformado como NOT paused", async () => {
    const env = { ...baseEnv, OAUTH_KV: mockKv("nao-eh-json") } as Env;
    expect(await isPaused(env)).toBe(false);
  });

  it("dispatchCron pula execução quando paused", async () => {
    const env = { ...baseEnv, OAUTH_KV: mockKv(JSON.stringify({ paused: true })) } as Env;
    const result = (await dispatchCron("*/5 * * * *", env)) as { paused: boolean };
    expect(result.paused).toBe(true);
  });

  it("KILL_SWITCH_KEY é constante consistente", () => {
    expect(KILL_SWITCH_KEY).toBe("emergency_pause");
  });
});
