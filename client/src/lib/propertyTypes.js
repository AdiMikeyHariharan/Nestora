// Residential vs commercial, and the property types allowed in each.
// Mirrored in server/src/property-types.ts — keep the two lists in sync.
export const PROPERTY_TYPES = {
  residential: ["Apartment", "Villa", "Independent House", "Plot", "Studio", "PG/Hostel"],
  commercial: ["Office", "Shop", "Showroom", "Warehouse", "Co-working", "Commercial Land"]
};

// Types where bedrooms/bathrooms don't apply.
export const hasRooms = (segment, type) => segment !== "commercial" && type !== "Plot";
