// Token-efficient context for the LLM prompts.
//
// The search assistant used to send the whole catalogue as JSON on every request
// (~4.3k tokens), which fits only one request a minute in Groq's free tier. Now it
// sends the listings most relevant to the conversation as a compact pipe table, and
// conversation history is trimmed to a character budget.
import { PROPERTY_TYPES } from "./property-types";
import { looksLikeInjection } from "./llm-guard";

const MAX_ROWS = 15;
const TYPES = [...PROPERTY_TYPES.residential, ...PROPERTY_TYPES.commercial];
const SYNONYMS: Record<string, string> = { flat: "Apartment", house: "Independent House", land: "Plot", office: "Office", shop: "Shop" };

const toInr = (n: string, unit: string) => {
  const x = parseFloat(n), u = unit.toLowerCase();
  return u.startsWith("c") ? x * 1e7 : u.startsWith("l") ? x * 1e5 : u === "k" ? x * 1e3 : x;
};

// What the visitor seems to want, read from their recent messages (plain parsing of
// user text into numbers and keywords — nothing here comes from the model).
export function parseWants(text: string) {
  const t = text.toLowerCase();
  let max: number | null = null, min: number | null = null;
  for (const m of t.matchAll(/(under|below|less than|upto|up to|within|max|above|over|more than|min|from)?\s*(?:rs\.?|₹|inr)?\s*(\d+(?:\.\d+)?)\s*(crores?|cr|lakhs?|lacs?|l|k)\b/g)) {
    if (/above|over|more than|min|from/.test(m[1] || "")) min = toInr(m[2], m[3]);
    else max = toInr(m[2], m[3]);
  }
  return {
    text: t, max, min,
    beds: t.match(/(\d(?:\.5)?)\s*-?\s*bhk/)?.[1] ?? null,
    type: /\b(rent|rental|lease|monthly)\b/.test(t) ? "rent" : /\b(buy|sale|purchase)\b/.test(t) ? "buy" : null,
    kind: TYPES.find(p => t.includes(p.toLowerCase())) ?? Object.entries(SYNONYMS).find(([w]) => new RegExp(`\\b${w}s?\\b`).test(t))?.[1] ?? null
  };
}

// Rank listings by fit (location, buy/rent, budget, BHK, kind); newest first on ties.
// `rows` must already be newest-first. Listings whose title reads like a prompt
// injection never reach the model.
export function relevantListings(rows: any[], conversation: string): any[] {
  const w = parseWants(conversation);
  return rows
    .filter(r => !looksLikeInjection(r.title))
    .map((r, i) => {
      let s = 0;
      if (r.area && w.text.includes(String(r.area).toLowerCase())) s += 4;
      if (r.city && w.text.includes(String(r.city).toLowerCase())) s += 3;
      if (w.type) s += r.type === w.type ? 2 : -4;
      if (w.kind) s += r.property_type === w.kind ? 2 : -1;
      if (w.beds) s += Number(r.beds) === Number(w.beds) ? 2 : 0;
      if (w.max != null) s += Number(r.price_inr) <= w.max ? 2 : -3;
      if (w.min != null) s += Number(r.price_inr) >= w.min ? 1 : -2;
      return { r, s, i };
    })
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, MAX_ROWS)
    .map(x => x.r);
}

const price = (v: number, rent: boolean) =>
  rent ? (v >= 1000 ? `₹${+(v / 1000).toFixed(1)}k/mo` : `₹${v}/mo`)
    : v >= 1e7 ? `₹${+(v / 1e7).toFixed(2)} Cr` : `₹${+(v / 1e5).toFixed(1)} L`;

// One header line and one short line per listing (about a third of the JSON size).
// Seller text is flattened and capped so it can't break the table.
export function inventoryTable(rows: any[]): string {
  const cell = (v: any) => String(v ?? "").replace(/[|\r\n]+/g, " ").trim().slice(0, 60);
  return ["id|title|for|city|area|price|bhk|sqft|kind|furnishing", ...rows.map(r => [
    r.id, r.title, r.type === "rent" ? "rent" : "sale", r.city, r.area, price(Number(r.price_inr), r.type === "rent"),
    r.beds, r.sqft, r.property_type, r.furnishing
  ].map(cell).join("|"))].join("\n");
}

// Keep the most recent items whose combined text fits `maxChars` (the newest is always kept).
export function fitHistory<T>(items: T[], text: (x: T) => string, maxChars: number): T[] {
  let total = 0, start = items.length;
  while (start > 0 && (start === items.length || total + text(items[start - 1]).length <= maxChars)) total += text(items[--start]).length;
  return items.slice(start);
}
