import { createHarness } from "./harness";
export const signedNight = {
  propertyId: "prop_velana",
  roomTypeId: "rt_velana_0",
  date: "2026-12-10",
};
export const signedKey = "prop_velana:rt_velana_0:2026-12-10";
export const maxTotal = { micros: 1000000000n };
export async function signedFixture(size = 5) {
  const h = await createHarness();
  h.container.ports.inventory.update(signedKey, (r) => ({
    ...r,
    state: {
      ...r.state,
      F: 100,
      k: 0,
      S: 10,
      q: 0,
      held: 0,
      booked: 0,
      traderAsks: [],
    },
  }));
  const maker = await h.signInAs("orb", "signed_maker");
  const buyer = await h.signInAs("orb", "signed_buyer");
  await maker.clients.market.buy({
    night: signedNight,
    size: { tenths: size },
    maxTotal,
  });
  return { h, maker, buyer, market: maker.clients.market };
}
