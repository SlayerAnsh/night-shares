import type { CatalogProperty, CatalogRepo } from "./catalog-repo";
import { alpen } from "./seed/alpen";
import { machiya } from "./seed/machiya";
import { rive } from "./seed/rive";
import { salinas } from "./seed/salinas";
import { ubud } from "./seed/ubud";
import { velana } from "./seed/velana";
export function createMemoryCatalogRepo(): CatalogRepo {
  const properties: CatalogProperty[] = [
    velana,
    ubud,
    salinas,
    rive,
    machiya,
    alpen,
  ];
  return {
    list: () => structuredClone(properties),
    get: (id) => structuredClone(properties.find((p) => p.id === id)),
    getRoomType: (id, roomTypeId) =>
      structuredClone(
        properties
          .find((p) => p.id === id)
          ?.roomTypes.find((r) => r.id === roomTypeId),
      ),
  };
}
