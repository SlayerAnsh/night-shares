import type { CatalogProperty } from "../catalog-repo";
export const rive: CatalogProperty = {
  code: "RIVE",
  name: "Hôtel Rive Gauche",
  city: "Paris",
  country: "France",
  type: "City",
  base: 410,
  rooms: 14,
  rating: 4.76,
  reviews: 1203,
  phase: 4.6,
  popular: true,
  tone: ["#C9B9A6", "#4D4038"],
  blurb:
    "Fourteen rooms in a Haussmann building on the Left Bank, between Saint-Germain and the river. Small, quiet, and well run. The bar opens onto the courtyard after six.",
  id: "prop_rive",
  modelId: "rive",
  photos: [
    "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=1400&q=72",
    "https://images.unsplash.com/photo-1611892440504-42a792e24d32?auto=format&fit=crop&w=1400&q=72",
    "https://images.unsplash.com/photo-1564501049412-61c2a3083791?auto=format&fit=crop&w=1400&q=72",
    "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=1400&q=72",
    "https://images.unsplash.com/photo-1445019980597-93fa8acb246c?auto=format&fit=crop&w=1400&q=72",
  ],
  amenities: [
    "Courtyard bar",
    "Concierge",
    "Rain showers",
    "Breakfast available",
    "Bikes",
    "Fast Wi-Fi",
  ],
  roomTypes: [
    {
      id: "rt_rive_0",
      name: "Classique",
      spec: "22 m² · Double bed · Courtyard",
      rateMultiplier: 1,
    },
    {
      id: "rt_rive_1",
      name: "Balcon Suite",
      spec: "38 m² · King bed · Street balcony",
      rateMultiplier: 1.55,
    },
  ],
};
