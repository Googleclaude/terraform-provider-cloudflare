import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerGithubTools } from "../src/tools/github";

interface CapturedTool {
  name: string;
  handler: (args: any) => Promise<any>;
}

const mockServer = () => {
  const tools: CapturedTool[] = [];
  const server = {
    tool(name: string, _d: string, _s: unknown, handler: (args: any) => Promise<any>) {
      tools.push({ name, handler });
    },
  };
  return { server: server as any, tools };
};

const mockAudit = () =>
  ({
    prepare: vi.fn(() => ({ bind: vi.fn(() => ({ run: vi.fn().mockResolvedValue({ success: true }) })) })),
  } as unknown as D1Database);

describe("github_open_pr", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("falha sem GITHUB_TOKEN configurado", async () => {
    const { server, tools } = mockServer();
    registerGithubTools(server, { sub: "u", scopes: [], cfToken: "" } as any, {
      AUDIT: mockAudit(),
    } as any);
    const tool = tools.find((t) => t.name === "github_open_pr")!;
    await expect(
      tool.handler({
        owner: "x",
        repo: "y",
        base: "main",
        branch: "agent/test",
        title: "test",
        body: "b",
        files: [{ path: "a.txt", content: "hello" }],
        draft: true,
      })
    ).rejects.toThrow(/GITHUB_TOKEN não configurado/);
  });

  it("idempotência: retorna PR existente sem criar branch nem commitar arquivos", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [{ number: 42, html_url: "https://github.com/x/y/pull/42" }],
        }),
      });
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = mockServer();
    registerGithubTools(server, { sub: "u", scopes: [], cfToken: "" } as any, {
      AUDIT: mockAudit(),
      GITHUB_TOKEN: "ghp_fake",
    } as any);
    const tool = tools.find((t) => t.name === "github_open_pr")!;
    const res = await tool.handler({
      owner: "x",
      repo: "y",
      base: "main",
      branch: "agent/test",
      title: "test",
      body: "b",
      files: [{ path: "a.txt", content: "hello" }],
      draft: true,
    });
    expect(res.content[0].text).toContain("já existente (idempotência)");
    expect(res.content[0].text).toContain("#42");
    // só uma fetch call: a busca por PR existente
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url] = fetchSpy.mock.calls[0]!;
    expect(url).toContain("/search/issues");
  });
});
