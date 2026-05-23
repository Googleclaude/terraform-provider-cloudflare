import { runHealthCheck } from "../runbooks/health-check";
import { detectDnsDrift } from "../runbooks/dns-drift";

export const KILL_SWITCH_KEY = "emergency_pause";

export async function isPaused(env: Env): Promise<boolean> {
  try {
    const raw = await env.OAUTH_KV.get(KILL_SWITCH_KEY);
    if (!raw) return false;
    const state = JSON.parse(raw) as { paused?: boolean };
    return state.paused === true;
  } catch (err) {
    console.warn("falha ao ler kill switch — assumindo NOT paused", err);
    return false;
  }
}

export async function dispatchCron(cron: string, env: Env): Promise<unknown> {
  if (await isPaused(env)) {
    console.warn(`cron ${cron} ignorado — kill switch ativo`);
    return { paused: true, cron };
  }

  switch (cron) {
    case "*/5 * * * *":
      return runHealthCheck(env);
    case "0 * * * *":
      return detectDnsDrift(env);
    case "0 3 * * *":
      return { ok: true, daily_report: true };
    default:
      console.warn(`cron desconhecido: ${cron}`);
      return null;
  }
}
