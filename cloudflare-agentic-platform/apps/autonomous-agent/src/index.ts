import { AutonomousAgent } from "./agent";
import { dispatchCron } from "./triggers/cron";
export { AutonomousAgent };

export default {
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(dispatchCron(event.cron, env).then((r) => console.info("cron done", r)));
  },
  async fetch(_req: Request, _env: Env): Promise<Response> {
    return new Response("Autonomous Agent — operating", { status: 200 });
  },
} satisfies ExportedHandler<Env>;
