import { expect, test } from "bun:test";
import { create } from "@bufbuild/protobuf";
import { SearchStaysRequestSchema } from "@night-shares/proto/catalog/v1/catalog_pb";
import { fixture } from "../../stay/test-support/fixture";
import { createSearchStays } from "./search-stays";

test("search filters destination and sorts live prices", () => {
  const search = createSearchStays(fixture().ports);
  const all = search(create(SearchStaysRequestSchema, { sort: "lo" }));
  expect(all).toHaveLength(6);
  expect(
    all.every(
      (s, i) =>
        i === 0 || s.average.micros >= (all[i - 1]?.average.micros ?? 0n),
    ),
  ).toBe(true);
  expect(all.every((s) => s.total.micros === 0n && !s.isDeal)).toBe(true);
  expect(
    search(create(SearchStaysRequestSchema, { destination: "velana" })),
  ).toHaveLength(1);
});
test("dated cards match quotes and divide averages by rooms and nights", () => {
  const f = fixture();
  f.selection.rooms = 2;
  f.selection.propertyId = "prop_ubud";
  f.selection.roomTypeId = "rt_ubud_0";
  const quote = f.cases.quoteStay(f.selection);
  const cards = createSearchStays(f.ports)(
    create(SearchStaysRequestSchema, {
      ...f.selection,
      $typeName: undefined,
      destination: "ubud",
    }),
  );
  expect(cards[0]?.total.micros).toBe(quote.total?.micros);
  expect(cards[0]?.average.micros).toBe((quote.total?.micros ?? 0n) / 4n);
});
