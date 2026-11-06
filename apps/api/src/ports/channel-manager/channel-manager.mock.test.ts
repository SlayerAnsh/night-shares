import { expect, test } from "bun:test";
import { buildContainer } from "../../container/build-container";

test("channel manager imports room types and returns stable hotel references", async () => {
  const { ports } = buildContainer({
    port: 0,
    adapters: "mock",
    today: "2026-12-01",
  });
  const { roomTypes } = await ports.channelManager.connect({
    propertyId: "prop_velana",
    pms: "Mews",
  });
  expect(roomTypes).toHaveLength(2);
  expect(typeof roomTypes[0]?.usualRate).toBe("bigint");
  const input = {
    bookingId: "bk_0001",
    propertyId: "prop_velana",
    roomTypeId: "rt_velana_0",
    checkIn: "2026-12-24",
    checkOut: "2026-12-25",
    rooms: 1,
    guestName: "Guest",
    guestEmail: "guest@example.test",
  };
  expect(await ports.channelManager.pushReservation(input)).toEqual({
    hotelRef: "VEL-000001",
  });
  expect(await ports.channelManager.pushReservation(input)).toEqual({
    hotelRef: "VEL-000001",
  });
});
