import type { CatalogProperty } from "../catalog-repo";
export const alpen: CatalogProperty = {
  code: "ALPEN",
  name: "Alpenglow Lodge",
  city: "Zermatt",
  country: "Switzerland",
  type: "Mountains",
  base: 610,
  rooms: 8,
  rating: 4.9,
  reviews: 237,
  phase: 5.5,
  popular: false,
  tone: ["#A9B8C9", "#2A3646"],
  blurb:
    "A larch-clad lodge with a direct view of the Matterhorn and ski-in access from the Sunnegga run. Eight suites, a wood-fired sauna and a fondue room that seats twelve.",
  id: "prop_alpen",
  modelId: "alpen",
  photos: [
    "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=1400&q=72",
    "https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=1400&q=72",
    "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1400&q=72",
    "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1400&q=72",
    "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=1400&q=72",
  ],
  amenities: [
    "Ski-in access",
    "Sauna",
    "Ski room",
    "Half board",
    "Fireplace",
    "Fast Wi-Fi",
  ],
  roomTypes: [
    {
      id: "rt_alpen_0",
      name: "Larch Suite",
      spec: "45 m² · King bed · Valley view",
      rateMultiplier: 1,
    },
    {
      id: "rt_alpen_1",
      name: "Matterhorn Suite",
      spec: "64 m² · King bed · Peak view",
      rateMultiplier: 1.38,
    },
  ],
};
