import type { Clock } from "../clock/clock";
import type { IdGenerator } from "../ids/id-generator";
import type { ActivityEvent, ActivityLog } from "./activity-log";

export function createMemoryActivityLog(deps: {
  clock: Clock;
  ids: IdGenerator;
}): ActivityLog {
  const events: ActivityEvent[] = [];
  return {
    append(input) {
      const event = {
        ...input,
        id: deps.ids.next("act"),
        at: deps.clock.now(),
      };
      events.push(event);
      return { ...event };
    },
    list(filter) {
      return events
        .slice()
        .reverse()
        .filter(
          (event) =>
            (filter.nightKey === undefined ||
              event.nightKey === filter.nightKey) &&
            (filter.propertyId === undefined ||
              event.propertyId === filter.propertyId) &&
            (filter.kinds === undefined || filter.kinds.includes(event.kind)),
        )
        .sort((a, b) => b.at - a.at)
        .slice(
          0,
          filter.limit === undefined ? undefined : Math.max(0, filter.limit),
        )
        .map((event) => ({ ...event }));
    },
  };
}
