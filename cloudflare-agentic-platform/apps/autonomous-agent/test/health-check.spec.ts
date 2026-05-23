import { describe, it, expect, vi, beforeEach } from "vitest";
import { runHealthCheck } from "../src/runbooks/health-check";

const baseEnv = {
  HOSTS_TO_CHECK: "https://a.example.com,https://b.example.com",
} as Env;

describe("runHealthCheck", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("marca ok para 200 com baixa latência", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200 }),
    );
    const results = await runHealthCheck(baseEnv);
    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(r.severity).toBe("ok");
      expect(r.status).toBe(200);
    }
  });

  it("marca crit para status >= 400", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 503 }),
    );
    const results = await runHealthCheck(baseEnv);
    for (const r of results) {
      expect(r.severity).toBe("crit");
    }
  });

  it("marca crit para erros de rede", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom")));
    const results = await runHealthCheck(baseEnv);
    for (const r of results) {
      expect(r.severity).toBe("crit");
      expect(r.status).toBe("error");
    }
  });
});
