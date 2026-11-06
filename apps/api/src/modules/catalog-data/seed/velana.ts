import type { CatalogProperty } from "../catalog-repo";
export const velana: CatalogProperty = {
  code: "VELANA",
  name: "Velana Water Villas",
  city: "Malé Atoll",
  country: "Maldives",
  type: "Beach",
  base: 780,
  rooms: 6,
  rating: 4.94,
  reviews: 412,
  phase: 0.3,
  popular: true,
  tone: ["#7CC4CF", "#1D5C74"],
  blurb:
    "Six overwater villas on a quiet house reef, twenty minutes by seaplane from Malé. Each villa has a private deck, a plunge pool and steps straight into the lagoon.",
  id: "prop_velana",
  modelId: "velana",
  photos: [
    "https://images.unsplash.com/photo-1573843981267-be1999ff37cd?auto=format&fit=crop&w=1400&q=72",
    "https://images.unsplash.com/photo-1514282401047-d79a71a590e8?auto=format&fit=crop&w=1400&q=72",
    "https://images.unsplash.com/photo-1540541338287-41700207dee6?auto=format&fit=crop&w=1400&q=72",
    "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1400&q=72",
    "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=1400&q=72",
  ],
  amenities: [
    "Private plunge pool",
    "Seaplane transfer",
    "House reef",
    "Breakfast included",
    "Butler service",
    "Fast Wi-Fi",
  ],
  roomTypes: [
    {
      id: "rt_velana_0",
      name: "Overwater Villa",
      spec: "95 m² · King bed · Lagoon steps",
      rateMultiplier: 1,
    },
    {
      id: "rt_velana_1",
      name: "Sunset Pool Villa",
      spec: "130 m² · King bed · West facing",
      rateMultiplier: 1.28,
    },
  ],
};
