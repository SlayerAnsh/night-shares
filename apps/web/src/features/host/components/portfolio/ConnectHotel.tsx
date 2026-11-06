"use client";
import { Pms } from "@night-shares/proto/host/v1/opening_pb";
import { useRequireAccess } from "../../../../session/require-access";
import { useHostMutations, useProperty } from "../../hooks/use-host-data";
import { useHostSearch } from "../../hooks/use-host-search";
import { ErrorMessage } from "../shared/HostFacts";

export function ConnectHotel({ owned }: { owned: string[] }) {
  const salinas = useProperty("prop_salinas");
  const machiya = useProperty("prop_machiya");
  const options = [salinas.data?.property, machiya.data?.property].filter(
    (p) => p && !owned.includes(p.id),
  );
  const { search, set } = useHostSearch();
  const propertyId = search.get("connect") ?? options[0]?.id ?? "";
  const pms = Number(search.get("pms") ?? Pms.MEWS);
  const { connect } = useHostMutations();
  const access = useRequireAccess();
  return (
    <section>
      <h2>Connect a hotel</h2>
      <p>
        Connect its channel manager to start offering nights. Room types and
        usual rates import on their own.
      </p>
      <ErrorMessage error={salinas.error ?? machiya.error} />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          set({ connect: propertyId, pms: String(pms) });
          if (access.require("host", "orb"))
            connect.mutate({ propertyId, pms });
        }}
      >
        <label>
          Hotel{" "}
          <select
            required
            value={propertyId}
            onChange={(e) => set({ connect: e.target.value })}
          >
            <option value="">Choose a hotel</option>
            {options.map(
              (p) =>
                p && (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ),
            )}
          </select>
        </label>
        <label>
          Channel manager{" "}
          <select value={pms} onChange={(e) => set({ pms: e.target.value })}>
            <option value={Pms.MEWS}>Mews</option>
            <option value={Pms.CLOUDBEDS}>Cloudbeds</option>
            <option value={Pms.SITE_MINDER}>SiteMinder</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={
            connect.isPending || !options.some((p) => p?.id === propertyId)
          }
        >
          Connect
        </button>
        <ErrorMessage error={connect.error} />
      </form>
      {!options.length && !salinas.isPending && !machiya.isPending && (
        <p>No hotels available to connect.</p>
      )}
      {connect.data?.property && (
        <div role="status">
          <h3>Imported room types: {connect.data.property.name}</h3>
          <ul>
            {connect.data.property.roomTypes.map((room) => (
              <li key={room.id}>
                {room.name}: {room.spec}
              </li>
            ))}
          </ul>
          <a href={`/host/${connect.data.property.id}`}>Open nights</a>
        </div>
      )}
    </section>
  );
}
