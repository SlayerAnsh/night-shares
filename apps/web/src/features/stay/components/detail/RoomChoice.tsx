"use client";
import type { RoomType } from "@night-shares/proto/catalog/v1/property_pb";
import { formatUsdc } from "../../../../shared/format";
import { useRoomQuote } from "../../hooks/use-room-quote";
import { useStaySearch } from "../../hooks/use-stay-search";
import { QueryState } from "../shared/QueryState";
export function RoomChoice({
  propertyId,
  room,
  selected,
}: {
  propertyId: string;
  room: RoomType;
  selected: boolean;
}) {
  const { update, hasDates } = useStaySearch();
  const quote = useRoomQuote(propertyId, room.id);
  return (
    <div>
      <label>
        <input
          type="radio"
          name="room"
          checked={selected}
          onChange={() => update({ roomTypeId: room.id })}
        />
        {room.name} · {room.spec}
      </label>
      {hasDates && (
        <>
          <QueryState pending={quote.isPending} error={quote.error} />
          {quote.data?.quote && (
            <p>{formatUsdc(quote.data.quote.total?.micros ?? 0n)} per stay</p>
          )}
        </>
      )}
    </div>
  );
}
