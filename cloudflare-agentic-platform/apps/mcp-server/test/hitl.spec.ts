import { describe, it, expect } from "vitest";
import { isDestructive, requireApproval } from "../src/hitl";

describe("hitl", () => {
  it("isDestructive identifica prefixos perigosos", () => {
    expect(isDestructive("delete_dns_record")).toBe(true);
    expect(isDestructive("disable_waf_rule")).toBe(true);
    expect(isDestructive("rotate_api_token")).toBe(true);
    expect(isDestructive("purge_cache")).toBe(true);
    expect(isDestructive("drop_database")).toBe(true);
  });

  it("isDestructive ignora tools seguras", () => {
    expect(isDestructive("dns_list_records")).toBe(false);
    expect(isDestructive("waf_list_custom_rules")).toBe(false);
    expect(isDestructive("audit_log_recent")).toBe(false);
  });

  it("requireApproval retorna prompt estruturado", () => {
    const res = requireApproval({
      tool: "delete_dns_record",
      args: { zone_id: "z1", record_id: "r1" },
      reason: "user request",
      impact: "remove www CNAME",
    });
    expect(res.promptForApproval).toBe(true);
    expect(res.message).toContain("delete_dns_record");
    expect(res.message).toContain("remove www CNAME");
  });
});
