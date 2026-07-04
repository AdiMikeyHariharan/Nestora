// Natural-language property search — shared by the hero search bar and the chat assistant.
// Parses BHK, buy/rent, budget (cr/lakh/k), resale/new, pincode, city/area and "near <landmark>".
import { api } from "../api.js";

export function parseQuery(t, places = []) {
  const q = {};
  const bhk = t.match(/(\d+)\s*bhk/); if (bhk) q.beds = parseInt(bhk[1], 10);
  if (/\brent(al|ing)?\b|to let|lease/.test(t)) q.type = "rent";
  else if (/\bbuy(ing)?\b|purchase|sale/.test(t)) q.type = "buy";
  if (/resale|second hand|pre-?owned/.test(t)) q.category = "resale";
  else if (/new project|under construction|brand new/.test(t)) q.category = "new";
  const cr = t.match(/([\d.]+)\s*(cr|crore)/);
  const lakh = t.match(/([\d.]+)\s*(l|lakh|lac)\b/);
  const k = t.match(/([\d.]+)\s*k\b/);
  const raw = t.match(/(?:under|below|max|upto|up to|budget|within)\s*(?:rs\.?|₹)?\s*([\d,]{4,})/);
  if (cr) q.budget = parseFloat(cr[1]) * 10000000;
  else if (lakh) q.budget = parseFloat(lakh[1]) * 100000;
  else if (k) q.budget = parseFloat(k[1]) * 1000;
  else if (raw) q.budget = parseInt(raw[1].replace(/,/g, ""), 10);
  if (!q.type && q.budget) q.type = q.budget >= 500000 ? "buy" : "rent";
  const near = t.match(/near(?:by| to)?\s+([a-z0-9' ]+?)(?:\s+(?:under|below|for|with|upto|up to|in)\b|[.,!?]|$)/);
  if (near) q.near = near[1].trim();
  for (const place of places) {
    if (t.includes(place.toLowerCase()) && place.toLowerCase() !== q.near) { q.place = place; break; }
  }
  const pin = t.match(/\b(\d{6})\b/); if (pin) q.pincode = pin[1];
  return q;
}

let propCache = null;
export async function allProperties() {
  if (!propCache) propCache = (await api.get("/properties")).properties;
  return propCache;
}

// Turn free text into a /listings URL, geocoding "near <landmark>" when present.
export async function nlToUrl(text) {
  const all = await allProperties().catch(() => []);
  const places = [...new Set(all.flatMap(p => [p.city, p.area]))];
  const q = parseQuery(text.toLowerCase(), places);
  const params = new URLSearchParams();
  if (q.beds) params.set("beds", q.beds);
  if (q.type) params.set("type", q.type);
  if (q.category) params.set("category", q.category);
  if (q.budget) params.set("budget", q.budget);
  if (q.pincode) params.set("pincode", q.pincode);
  if (q.near) {
    try {
      const { results } = await api.get("/geocode?q=" + encodeURIComponent(q.near));
      if (results.length) {
        params.set("near", results[0].lat + "," + results[0].lng);
        params.set("radius", "10");
        params.set("lname", results[0].name);
        return "/listings?" + params;
      }
    } catch { /* fall through to text search */ }
  }
  if (q.place) params.set("q", q.place);
  return "/listings?" + params;
}
