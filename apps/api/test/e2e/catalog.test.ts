import { expect, test } from "bun:test";
import { createHarness } from "./harness";

test("catalog destinations, filtered stays and property details work anonymously", async () => {
  const h = await createHarness();
  try {
    const { destinations } = await h.clients.catalog.listDestinations({
      text: "bali",
    });
    expect(destinations).toHaveLength(1);
    expect(destinations[0]?.stayCount).toBe(1);
    const { stays } = await h.clients.catalog.searchStays({
      destination: "ubud",
      sort: "lo",
    });
    expect(stays).toHaveLength(1);
    const { property } = await h.clients.catalog.getProperty({
      propertyId: stays[0]?.property?.id,
    });
    expect(property?.roomTypes).toHaveLength(2);
    expect(property?.photos.length).toBeGreaterThan(0);
  } finally {
    await h.close();
  }
});
