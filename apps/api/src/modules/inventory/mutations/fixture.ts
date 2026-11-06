import { buildContainer } from "../../../container/build-container";
export function fixture() {
  const { ports } = buildContainer({
    port: 0,
    adapters: "mock",
    today: "2026-12-01",
  });
  const record = ports.inventory.get("prop_velana:rt_velana_0:2026-12-24");
  record.state = {
    ...record.state,
    q: 2,
    booked: 1,
    held: 1,
    traderAsks: [{ price: 1000, size: 0.5, who: "seller" }],
  };
  return record;
}
