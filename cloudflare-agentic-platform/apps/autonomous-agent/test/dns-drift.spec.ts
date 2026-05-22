import { describe, it, expect } from "vitest";
import { diffRecords } from "../src/runbooks/dns-drift";

const live = (overrides: Partial<{ type: string; name: string; content: string }>) => ({
  id: "r1",
  type: "A",
  name: "@",
  content: "1.1.1.1",
  ttl: 300,
  proxied: true,
  ...overrides,
});

describe("diffRecords", () => {
  it("retorna vazio quando declarado bate com live", () => {
    const decl = [{ type: "A", name: "@", content: "1.1.1.1" }];
    const liveRecs = [live({})];
    const { missing, unexpected } = diffRecords(decl, liveRecs);
    expect(missing).toEqual([]);
    expect(unexpected).toEqual([]);
  });

  it("identifica missing quando declarado não está em live", () => {
    const decl = [
      { type: "A", name: "@", content: "1.1.1.1" },
      { type: "CNAME", name: "www", content: "ex.com" },
    ];
    const { missing, unexpected } = diffRecords(decl, [live({})]);
    expect(missing).toHaveLength(1);
    expect(missing[0]?.name).toBe("www");
    expect(unexpected).toEqual([]);
  });

  it("identifica unexpected quando live tem registro fora do declarado", () => {
    const decl = [{ type: "A", name: "@", content: "1.1.1.1" }];
    const liveRecs = [
      live({}),
      live({ type: "TXT", name: "rogue", content: "v=spf1" }),
    ];
    const { missing, unexpected } = diffRecords(decl, liveRecs);
    expect(missing).toEqual([]);
    expect(unexpected).toHaveLength(1);
    expect(unexpected[0]?.name).toBe("rogue");
  });

  it("ignora NS e SOA na lista de unexpected (gerenciados pela Cloudflare)", () => {
    const decl = [{ type: "A", name: "@", content: "1.1.1.1" }];
    const liveRecs = [
      live({}),
      live({ type: "NS", name: "@", content: "ns1.cloudflare.com" }),
      live({ type: "SOA", name: "@", content: "ns.cloudflare.com" }),
    ];
    const { unexpected } = diffRecords(decl, liveRecs);
    expect(unexpected).toEqual([]);
  });

  it("trata mudança de content como missing + unexpected (não match parcial)", () => {
    const decl = [{ type: "A", name: "@", content: "1.1.1.1" }];
    const liveRecs = [live({ content: "2.2.2.2" })];
    const { missing, unexpected } = diffRecords(decl, liveRecs);
    expect(missing).toHaveLength(1);
    expect(unexpected).toHaveLength(1);
  });
});
