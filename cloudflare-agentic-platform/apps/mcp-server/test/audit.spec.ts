import { describe, it, expect, vi } from "vitest";
import { logAction, withAudit } from "../src/audit";

const mockDb = () => {
  const run = vi.fn().mockResolvedValue({ success: true });
  const bind = vi.fn().mockReturnValue({ run });
  const prepare = vi.fn().mockReturnValue({ bind });
  return { prepare, _run: run, _bind: bind } as unknown as D1Database & {
    _run: ReturnType<typeof vi.fn>;
    _bind: ReturnType<typeof vi.fn>;
  };
};

describe("audit", () => {
  it("logAction grava no D1 com hashes", async () => {
    const db = mockDb();
    await logAction(db, {
      actor: "user@x",
      tool: "dns_create_record",
      input: { name: "a" },
      output: { ok: true },
      status: "success",
    });
    expect(db.prepare).toHaveBeenCalledOnce();
    expect(db._run).toHaveBeenCalledOnce();
  });

  it("withAudit registra sucesso", async () => {
    const db = mockDb();
    const out = await withAudit(db, "u", "t", { x: 1 }, async () => "ok");
    expect(out).toBe("ok");
    expect(db._run).toHaveBeenCalledOnce();
  });

  it("withAudit registra falha e propaga erro", async () => {
    const db = mockDb();
    await expect(
      withAudit(db, "u", "t", { x: 1 }, async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
    expect(db._run).toHaveBeenCalledOnce();
  });
});
