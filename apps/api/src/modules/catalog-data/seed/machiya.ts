import type { CatalogProperty } from "../catalog-repo";
export const machiya: CatalogProperty = {
  code: "MACHIYA",
  name: "Machiya Nine",
  city: "Kyoto",
  country: "Japan",
  type: "City",
  base: 290,
  rooms: 5,
  rating: 4.92,
  reviews: 351,
  phase: 2.2,
  popular: false,
  tone: ["#B9A58C", "#3D332A"],
  blurb:
    "Five restored townhouses in Higashiyama, each with a cedar bath and its own small garden. Gion is a ten minute walk. Quiet hours start at nine.",
  id: "prop_machiya",
  modelId: "machiya",
  photos: [
    "https://images.unsplash.com/photo-1445019980597-93fa8acb246c?auto=format&fit=crop&w=1400&q=72",
    "https://images.unsplash.com/photo-1584132967334-10e028bd69f7?auto=format&fit=crop&w=1400&q=72",
    "https://images.unsplash.com/photo-1564501049412-61c2a3083791?auto=format&fit=crop&w=1400&q=72",
    "https://images.unsplash.com/photo-1611892440504-42a792e24d32?auto=format&fit=crop&w=1400&q=72",
    "https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=1400&q=72",
  ],
  amenities: [
    "Cedar bath",
    "Private garden",
    "Tea service",
    "Bikes",
    "Self check-in",
    "Fast Wi-Fi",
  ],
  roomTypes: [
    {
      id: "rt_machiya_0",
      name: "Townhouse",
      spec: "55 m² · Futon or twin · Garden",
      rateMultiplier: 1,
    },
    {
      id: "rt_machiya_1",
      name: "Townhouse Large",
      spec: "80 m² · Sleeps 4 · Two floors",
      rateMultiplier: 1.3,
    },
  ],
};
