// Residential vs commercial, and the property types allowed in each.
// Mirrored in client/src/lib/propertyTypes.js — keep the two lists in sync.
export const PROPERTY_TYPES: Record<string, string[]> = {
  residential: ["Apartment", "Villa", "Independent House", "Plot", "Studio", "PG/Hostel"],
  commercial: ["Office", "Shop", "Showroom", "Warehouse", "Co-working", "Commercial Land"]
};

// Returns an error message, or null when segment + type are a valid pair.
export function checkSegmentType(segment: any, type: any): string | null {
  if (!PROPERTY_TYPES[segment]) return "Choose residential or commercial";
  if (!PROPERTY_TYPES[segment].includes(type)) return `Property type must be one of: ${PROPERTY_TYPES[segment].join(", ")}`;
  return null;
}
