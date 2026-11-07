import type { Clock } from "../ports/clock/clock";
import { redactRpc } from "../shared/redact-url";
export function createJobRunner(deps: {
  clock: Clock;
  intervalMs: number;
  jobs: { name: string; run(): Promise<void> }[];
  onError(error: unknown): void;
}) {
  let timer: ReturnType<typeof setInterval> | undefined;
  let running: Promise<void> | undefined;
  let lastRun = -Infinity;
  function tick(): Promise<void> {
    if (running) return running;
    lastRun = deps.clock.now();
    running = (async () => {
      const errors: unknown[] = [];
      for (const job of deps.jobs) {
        try {
          await job.run();
        } catch (error) {
          errors.push(redactRpc(error));
        }
      }
      if (errors.length)
        throw new AggregateError(errors, "Scheduled jobs failed.");
    })().finally(() => {
      running = undefined;
    });
    return running;
  }
  return {
    tick,
    start() {
      if (timer) return;
      timer = setInterval(() => {
        if (deps.clock.now() - lastRun >= deps.intervalMs)
          void tick().catch((error) => deps.onError(redactRpc(error)));
      }, deps.intervalMs);
    },
    async stop() {
      if (timer) clearInterval(timer);
      timer = undefined;
      await running;
    },
  };
}
