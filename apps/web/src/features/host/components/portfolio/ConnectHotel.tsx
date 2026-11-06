"use client";
import {
  buttonClass,
  cx,
  Segmented,
  Spinner,
} from "@night-shares/design-system";
import type { Property } from "@night-shares/proto/catalog/v1/property_pb";
import { Pms } from "@night-shares/proto/host/v1/opening_pb";
import Link from "next/link";
import { useRequireAccess } from "../../../../session/require-access";
import { useHostMutations } from "../../hooks/use-host-data";
import { useHostSearch } from "../../hooks/use-host-search";
import { ErrorNote } from "../ui/QueryState";
import ui from "../ui/ui.module.css";
import styles from "./ConnectHotel.module.css";

const PMS = [
  { value: Pms.MEWS, label: "Mews" },
  { value: Pms.CLOUDBEDS, label: "Cloudbeds" },
  { value: Pms.SITE_MINDER, label: "SiteMinder" },
] as const;

export function ConnectHotel({
  options,
  error,
  pending,
}: {
  options: Property[];
  error?: { message: string } | null;
  pending?: boolean;
}) {
  const { search, set } = useHostSearch();
  const propertyId = search.get("connect") ?? options[0]?.id ?? "";
  const pms = Number(search.get("pms") ?? Pms.MEWS) as Pms;
  const { connect } = useHostMutations();
  const access = useRequireAccess();
  const imported = connect.data?.property;
  const valid = options.some((p) => p.id === propertyId);
  return (
    <section
      id="connect"
      className={cx(ui.card, styles.onb)}
      aria-labelledby="connect-h"
    >
      <div>
        <div className={ui.lbl}>Add a hotel</div>
        <h2 id="connect-h" className={ui.display}>
          Connect your channel manager
        </h2>
        <p className={styles.lead}>
          Night Shares reads your room types, room counts and usual rates from
          your property system, so there is nothing to type in. You choose which
          nights and how many rooms to offer. Everything else runs on its own.
        </p>
        <ol className={styles.steps}>
          <li className={cx(imported && styles.done)}>
            Connect your channel manager
          </li>
          <li>Pick nights and how many rooms to offer</li>
          <li>Guests book, money is paid to your wallet automatically</li>
        </ol>
      </div>
      {imported ? (
        <div className={cx(styles.box, styles.done)} role="status">
          <h3>Imported room types: {imported.name}</h3>
          <table className={styles.imp}>
            <thead>
              <tr>
                <th>Room type</th>
              </tr>
            </thead>
            <tbody>
              {imported.roomTypes.map((room) => (
                <tr key={room.id}>
                  <td>
                    <b>{room.name}</b>
                    <div className={ui.muted}>{room.spec}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Link
            href={`/host/${imported.id}`}
            className={buttonClass({ variant: "primary", block: true })}
          >
            Go to my calendar
          </Link>
        </div>
      ) : (
        <form
          className={styles.box}
          onSubmit={(event) => {
            event.preventDefault();
            set({ connect: propertyId, pms: String(pms) });
            if (access.require("host", "orb"))
              connect.mutate({ propertyId, pms });
          }}
        >
          <label className={styles.field}>
            <span>Hotel</span>
            <select
              className={styles.select}
              required
              value={propertyId}
              onChange={(e) => set({ connect: e.target.value })}
            >
              <option value="">Choose a hotel</option>
              {options.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <div className={styles.field}>
            <span>Your channel manager</span>
            <Segmented
              label="Channel manager"
              options={PMS}
              value={pms}
              block
              onChange={(value) => set({ pms: String(value) })}
            />
          </div>
          <button
            type="submit"
            className={buttonClass({
              variant: "primary",
              size: "lg",
              block: true,
            })}
            disabled={connect.isPending || !valid}
          >
            {connect.isPending ? (
              <>
                <Spinner className={ui.spin} />
                Importing rooms and rates
              </>
            ) : (
              "Connect channel manager"
            )}
          </button>
          {!options.length && !pending && (
            <p className={ui.note}>No hotels available to connect.</p>
          )}
          <ErrorNote error={error ?? connect.error} />
          <p className={styles.cre}>
            Bookings sync back to your property system automatically through
            your channel manager.
          </p>
        </form>
      )}
    </section>
  );
}
