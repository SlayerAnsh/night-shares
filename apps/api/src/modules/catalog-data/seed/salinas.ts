import type { CatalogProperty } from "../catalog-repo";
export const salinas: CatalogProperty = {
  code: "SALINAS",
  name: "Casa Salinas",
  city: "Ibiza",
  country: "Spain",
  type: "Beach",
  base: 520,
  rooms: 7,
  rating: 4.81,
  reviews: 288,
  phase: 3.1,
  popular: false,
  tone: ["#E7C9A3", "#8A5A3B"],
  blurb:
    "A whitewashed finca behind the Ses Salines dunes. Seven rooms around a courtyard pool, a five minute walk to the beach and far enough from the clubs to actually sleep.",
  id: "prop_salinas",
  modelId: "salinas",
  photos: [
    "https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?auto=format&fit=crop&w=1400&q=72",
    "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1400&q=72",
    "https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=1400&q=72",
    "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1400&q=72",
    "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1400&q=72",
  ],
  amenities: [
    "Courtyard pool",
    "Beach access",
    "Bikes",
    "Breakfast included",
    "Late checkout",
    "Fast Wi-Fi",
  ],
  roomTypes: [
    {
      id: "rt_salinas_0",
      name: "Courtyard Room",
      spec: "32 m² · Queen bed · Pool view",
      rateMultiplier: 1,
    },
    {
      id: "rt_salinas_1",
      name: "Dune Suite",
      spec: "58 m² · King bed · Private terrace",
      rateMultiplier: 1.42,
    },
  ],
};
