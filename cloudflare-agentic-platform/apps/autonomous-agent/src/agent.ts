import { Agent } from "agents";
import { dispatchCron } from "./triggers/cron";

interface State {
  lastRun: number;
  lastHealth: unknown;
}

export class AutonomousAgent extends Agent<Env, State> {
  override initialState: State = { lastRun: 0, lastHealth: null };

  async onCron(cron: string): Promise<void> {
    const result = await dispatchCron(cron, this.env);
    this.setState({ ...this.state, lastRun: Date.now(), lastHealth: result });
    console.info(`cron ${cron} executed`, { result });
  }
}
