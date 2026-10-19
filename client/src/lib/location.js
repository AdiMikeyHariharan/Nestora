// Locality, pincode and map position are only sent to signed-up (verified) users;
// signed-out visitors get the city alone. These label a listing either way.
export const placeOf = p => p.area ? `${p.area}, ${p.city}` : p.city;
export const addressOf = p => p.area ? `${p.area}, ${p.city}${p.pincode ? ` — ${p.pincode}` : ""}` : p.city;
export const canSeeLocation = user => !!user?.verified;
