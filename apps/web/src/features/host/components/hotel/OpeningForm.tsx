import type { Property } from "@night-shares/proto/catalog/v1/property_pb";
import { formatRoomNights } from "../../../../shared/format";
import type { useOpening } from "../../hooks/use-opening";
import { ErrorMessage } from "../shared/HostFacts";
import { OpeningFields } from "./OpeningFields";
import { OpeningPreview } from "./OpeningPreview";

export function OpeningForm({
  property,
  opening: o,
}: {
  property: Property;
  opening: ReturnType<typeof useOpening>;
}) {
  const pending = o.open.isPending || o.stop.isPending;
  return (
    <section id="open-nights">
      <h2>Open nights</h2>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          o.openSelected();
        }}
      >
        <OpeningFields property={property} opening={o} disabled={pending} />
        {!o.valid && (
          <p>
            Select dates and room types. Date ranges must contain 1 to 240
            nights.
          </p>
        )}
        {o.valid && o.preview.isFetching && (
          <p role="status">Updating preview…</p>
        )}
        <ErrorMessage error={o.valid ? o.preview.error : null} />
        {o.valid && o.preview.data && (
          <OpeningPreview property={property} preview={o.preview.data} />
        )}
        <button
          type="submit"
          disabled={
            pending || !o.valid || !o.preview.isSuccess || o.preview.isFetching
          }
        >
          Open nights
        </button>
        <ErrorMessage error={o.open.error} />
        {o.open.data && (
          <p role="status">
            Opened {o.open.data.nights.length} room type nights.
          </p>
        )}
        <p>
          Stop selling takes back rooms still on sale. Rooms traders hold are
          not affected.
        </p>
        <button
          type="button"
          disabled={pending || !o.valid}
          onClick={o.stopSelected}
        >
          Stop selling for selected nights
        </button>
        <ErrorMessage error={o.stop.error} />
        {o.stop.data && (
          <p role="status">
            Took back{" "}
            {formatRoomNights(o.stop.data.roomsTakenBack?.tenths ?? 0)} rooms
            into your own inventory.
          </p>
        )}
      </form>
    </section>
  );
}
