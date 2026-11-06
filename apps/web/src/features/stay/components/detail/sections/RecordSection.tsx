import { Badge } from "@night-shares/design-system";
import type { WalkIncident } from "@night-shares/proto/catalog/v1/property_pb";
import styles from "../Detail.module.css";

const day = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

// Walked guest incidents are public, so a guest sees the hotel's record.
export function RecordSection({ incidents }: { incidents: WalkIncident[] }) {
  return (
    <section className={styles.sec}>
      <h2>Walked guest incidents</h2>
      <p>
        {incidents.length
          ? "Reports from guests who were not let in. False reports are marked."
          : "No guest has reported being turned away at this hotel."}
      </p>
      {incidents.length > 0 && (
        <ul className={styles.record}>
          {incidents.map((incident) => (
            <li key={incident.id}>
              <span>
                {incident.reportedAt
                  ? day.format(Number(incident.reportedAt.seconds) * 1000)
                  : incident.id}
              </span>
              {incident.isFalse ? (
                <Badge>False report</Badge>
              ) : (
                <Badge tone="neg">Walked guest</Badge>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
