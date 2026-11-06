import { Badge, cx } from "@night-shares/design-system";
import type { WalkIncident } from "@night-shares/proto/catalog/v1/property_pb";
import { shortInstant } from "../../model/calendar";
import {
  SCAN_NOTE,
  validWalks,
  WALK_LIMIT,
  WALK_RULE,
  walkStanding,
} from "../../model/walks";
import ui from "../ui/ui.module.css";
import styles from "./Walks.module.css";

/** Walk incidents at one hotel, with the host's standing across every hotel. */
export function WalkCard({
  name,
  incidents,
  total,
}: {
  name: string;
  incidents: WalkIncident[];
  /** Valid incidents across all the host's hotels, when known. */
  total?: number;
}) {
  const here = validWalks(incidents).length;
  const all = Math.max(total ?? here, here);
  const standing = walkStanding(all);
  return (
    <section className={cx(ui.card, styles.card)} aria-labelledby="walks-h">
      <div className={styles.head}>
        <div>
          <h2 id="walks-h">Guests turned away</h2>
          <p className={ui.muted}>
            Walk incidents at {name}. Each one stays on your public record, and{" "}
            {WALK_LIMIT} across your hotels stop new nights.
          </p>
        </div>
        <div className={cx(styles.count, here > 0 && styles[standing.tone])}>
          <b>{here}</b>
          <span>
            {here === 1 ? "incident" : "incidents"}
            {all !== here
              ? `, ${all} of ${WALK_LIMIT} in total`
              : ` of ${WALK_LIMIT}`}
          </span>
        </div>
      </div>
      <div className={styles.grid}>
        <div>
          {incidents.length ? (
            <ul className={styles.list}>
              {incidents.map((incident) => (
                <li key={incident.id}>
                  <div>
                    <b>{shortInstant(incident.reportedAt)}</b>
                    <span>Reported from My trips</span>
                  </div>
                  <Badge tone={incident.isFalse ? "pos" : "neg"}>
                    {incident.isFalse ? "False report" : "Walked guest"}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.none}>
              No guest has been turned away at this hotel.
            </p>
          )}
          {all > 0 && (
            <p className={cx(styles.st, styles[standing.tone])}>
              {standing.text}
            </p>
          )}
        </div>
        <div className={styles.how}>
          <p className={styles.scan}>
            <b>{SCAN_NOTE.split(". ")[0]}.</b> It is your proof the guest was
            let in.
          </p>
          <p className={ui.note}>
            {WALK_RULE} The rest comes from the cover fund and becomes your
            debt. Guests who report falsely are banned through World ID.
          </p>
        </div>
      </div>
    </section>
  );
}
