import type { ReleaseEvent } from "@night-shares/proto/host/v1/hotel_pb";
import { instantMs, shortInstant } from "../../model/calendar";
import { SCAN_NOTE } from "../../model/walks";
import { cx } from "../ui/cx";
import ui from "../ui/ui.module.css";
import styles from "./Timeline.module.css";

type Item = {
  key: string;
  at: number;
  label: string;
  text?: string;
  tone?: "now" | "rel";
};

// The API prefixes room type events with the room type id: "rt_x: Opened".
function split(description: string, names: Map<string, string>) {
  const [head, ...rest] = description.split(": ");
  if (!rest.length || !head) return { label: description };
  return { label: rest.join(": "), text: names.get(head) ?? head };
}

/** Opening, release, check in and check out for this night, with a marker for now. */
export function ReleaseTimeline({
  events,
  names,
  now,
}: {
  events: ReleaseEvent[];
  names: Map<string, string>;
  now: number;
}) {
  if (!events.length) return <p className={ui.note}>No release scheduled.</p>;
  const items: Item[] = events.map((event, i) => {
    const { label, text } = split(event.description, names);
    const at = event.at ? instantMs(event.at) : 0;
    const isCheckIn = /check in/i.test(label);
    return {
      key: `${i}:${event.description}`,
      at,
      label,
      text: isCheckIn ? SCAN_NOTE : text,
      tone: /unsold|release/i.test(label) ? "rel" : undefined,
    };
  });
  const first = items[0]?.at ?? 0;
  const last = items[items.length - 1]?.at ?? 0;
  if (now > first && now < last)
    items.push({ key: "now", at: now, label: "Today", tone: "now" });
  items.sort((a, b) => a.at - b.at);
  return (
    <ol className={styles.tl}>
      {items.map((item) => (
        <li
          key={item.key}
          className={cx(
            item.tone === "now"
              ? styles.now
              : item.at < now
                ? styles.done
                : item.tone === "rel" && styles.rel,
          )}
        >
          <span className={styles.t}>
            {item.tone === "now"
              ? "Now"
              : shortInstant({
                  seconds: BigInt(Math.floor(item.at / 1000)),
                  nanos: 0,
                })}
          </span>
          <b>{item.label}</b>
          {item.text && <p>{item.text}</p>}
        </li>
      ))}
    </ol>
  );
}
