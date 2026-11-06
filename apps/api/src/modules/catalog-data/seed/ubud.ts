import type { CatalogProperty } from "../catalog-repo";
export const ubud: CatalogProperty = {
  code: "UBUD",
  name: "Ubud Ridge House",
  city: "Ubud",
  country: "Bali",
  type: "Jungle",
  base: 340,
  rooms: 9,
  rating: 4.88,
  reviews: 690,
  phase: 1.4,
  popular: true,
  tone: ["#8EA86B", "#2F4A2B"],
  blurb:
    "Nine timber suites stepped down a rice-terrace ridge above the Ayung river. Morning yoga deck, an infinity pool over the valley and a kitchen that cooks from its own garden.",
  id: "prop_ubud",
  modelId: "ubud",
  photos: [
    "https://images.unsplash.com/photo-1537996194471-e657df975ab4?auto=format&fit=crop&w=1400&q=72",
    "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=1400&q=72",
    "https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=1400&q=72",
    "https://images.unsplash.com/photo-1611892440504-42a792e24d32?auto=format&fit=crop&w=1400&q=72",
    "https://images.unsplash.com/photo-1584132967334-10e028bd69f7?auto=format&fit=crop&w=1400&q=72",
  ],
  amenities: [
    "Infinity pool",
    "Yoga deck",
    "Garden kitchen",
    "Airport pickup",
    "Spa",
    "Fast Wi-Fi",
  ],
  roomTypes: [
    {
      id: "rt_ubud_0",
      name: "Ridge Suite",
      spec: "48 m² · Queen bed · Valley view",
      rateMultiplier: 1,
    },
    {
      id: "rt_ubud_1",
      name: "River Loft",
      spec: "72 m² · King bed · Outdoor bath",
      rateMultiplier: 1.35,
    },
  ],
};
