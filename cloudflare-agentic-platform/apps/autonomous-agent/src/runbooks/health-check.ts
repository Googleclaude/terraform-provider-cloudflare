export type Severity = "ok" | "warn" | "crit";

export interface HealthResult {
  host: string;
  status: number | "timeout" | "error";
  latency_ms: number;
  severity: Severity;
}

export async function runHealthCheck(env: Env): Promise<HealthResult[]> {
  const hosts = env.HOSTS_TO_CHECK.split(",").map((h) => h.trim()).filter(Boolean);
  const checks = hosts.map(async (host): Promise<HealthResult> => {
    const start = Date.now();
    try {
      const res = await Promise.race([
        fetch(host, { method: "HEAD" }),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 5000)),
      ]);
      const latency = Date.now() - start;
      const severity: Severity = !res.ok ? "crit" : latency > 2000 ? "warn" : "ok";
      return { host, status: res.status, latency_ms: latency, severity };
    } catch (err) {
      return {
        host,
        status: String(err).includes("timeout") ? "timeout" : "error",
        latency_ms: Date.now() - start,
        severity: "crit",
      };
    }
  });
  return Promise.all(checks);
}
