import { create } from "@bufbuild/protobuf";
import { SearchStaysRequestSchema } from "@night-shares/proto/catalog/v1/catalog_pb";
import type { Ports } from "../../../container/ports";
import { createSearchStays } from "./search-stays";
export function createListDestinations(ports: Ports) {
  const search = createSearchStays(ports);
  return (text: string) => {
    const groups = new Map<
      string,
      {
        city: string;
        country: string;
        stayCount: number;
        fromPrice: { micros: bigint };
      }
    >();
    for (const stay of search(create(SearchStaysRequestSchema))) {
      const { city, country } = stay.property;
      if (!`${city} ${country}`.toLowerCase().includes(text.toLowerCase()))
        continue;
      const key = `${city}:${country}`;
      const entry = groups.get(key) ?? {
        city,
        country,
        stayCount: 0,
        fromPrice: stay.average,
      };
      entry.stayCount++;
      if (stay.average.micros < entry.fromPrice.micros)
        entry.fromPrice = stay.average;
      groups.set(key, entry);
    }
    return [...groups.values()];
  };
}
