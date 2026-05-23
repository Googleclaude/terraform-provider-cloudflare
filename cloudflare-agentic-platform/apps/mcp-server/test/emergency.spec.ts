import { describe, it, expect, vi } from "vitest";
import { registerEmergencyTools, KILL_SWITCH_KEY } from "../src/tools/emergency";

interface CapturedTool {
  name: string;
  description: string;
  schema: unknown;
  handler: (args: any) => Promise<any>;
}

const mockServer = () => {
  const tools: CapturedTool[] = [];
  const server = {
    tool(name: string, description: string, schema: unknown, handler: (args: any) => Promise<any>) {
      tools.push({ name, description, schema, handler });
    },
  };
  return { server: server as any, tools };
};

const mockKv = () => {
  const store = new Map<string, string>();
  return {
    store,
    kv: {
      put: vi.fn(async (k: string, v: string) => store.set(k, v)),
      get: vi.fn(async (k: string) => store.get(k) ?? null),
      delete: vi.fn(async (k: string) => void store.delete(k)),
    } as unknown as KVNamespace,
  };
};

const mockAudit = () =>
  ({
    prepare: vi.fn(() => ({ bind: vi.fn(() => ({ run: vi.fn().mockResolvedValue({ success: true }) })) })),
  } as unknown as D1Database);

describe("emergency tools", () => {
  it("emergency_pause sem approved retorna prompt e NÃO escreve KV", async () => {
    const { server, tools } = mockServer();
    const { kv, store } = mockKv();
    registerEmergencyTools(server, { sub: "u@x", scopes: [], cfToken: "" } as any, {
      OAUTH_KV: kv,
      AUDIT: mockAudit(),
    } as any);
    const pause = tools.find((t) => t.name === "emergency_pause")!;
    const res = await pause.handler({ reason: "teste manual", approved: false });
    expect(res.content[0].text).toContain("confirmação obrigatória");
    expect(store.size).toBe(0);
  });

  it("emergency_pause com approved escreve flag em KV", async () => {
    const { server, tools } = mockServer();
    const { kv, store } = mockKv();
    registerEmergencyTools(server, { sub: "u@x", scopes: [], cfToken: "" } as any, {
      OAUTH_KV: kv,
      AUDIT: mockAudit(),
    } as any);
    const pause = tools.find((t) => t.name === "emergency_pause")!;
    const res = await pause.handler({ reason: "incident-1234", approved: true });
    expect(res.content[0].text).toContain("Kill switch ATIVO");
    expect(store.has(KILL_SWITCH_KEY)).toBe(true);
    const stored = JSON.parse(store.get(KILL_SWITCH_KEY)!);
    expect(stored.paused).toBe(true);
    expect(stored.by).toBe("u@x");
    expect(stored.reason).toBe("incident-1234");
  });

  it("emergency_resume remove a flag de KV", async () => {
    const { server, tools } = mockServer();
    const { kv, store } = mockKv();
    store.set(KILL_SWITCH_KEY, JSON.stringify({ paused: true }));
    registerEmergencyTools(server, { sub: "u@x", scopes: [], cfToken: "" } as any, {
      OAUTH_KV: kv,
      AUDIT: mockAudit(),
    } as any);
    const resume = tools.find((t) => t.name === "emergency_resume")!;
    await resume.handler({ reason: "fixed" });
    expect(store.has(KILL_SWITCH_KEY)).toBe(false);
  });
});
