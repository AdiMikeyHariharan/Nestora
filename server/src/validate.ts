// Input validation for every request field: type, length, format and allowed values,
// plus light normalisation (Unicode NFC, hidden/control characters removed, whitespace
// tidied). Bad input gets a 400 with a readable message instead of reaching the
// database. This is the first layer: queries stay parameterised and output is still
// escaped where it's rendered (React, email HTML, Excel).
import { HttpException } from "@nestjs/common";
import { PROPERTY_TYPES, checkSegmentType } from "./property-types";

const bad = (msg: string) => new HttpException({ error: msg }, 400);
// Control, zero-width and bidi characters (tab/newline are kept for multi-line text).
const HIDDEN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f​-‏‪-‮⁠-⁤﻿]/g;
const missing = (v: unknown) => v === undefined || v === null || v === "";

type TextOpts = { max: number; min?: number; multiline?: boolean };
// Text field. Numbers are accepted as text (forms send "641004" or 641004 alike).
export function text(v: unknown, label: string, { max, min = 1, multiline = false }: TextOpts): string {
  if (typeof v !== "string" && typeof v !== "number") throw bad(`${label} must be text`);
  let s = String(v).normalize("NFC").replace(HIDDEN, "");
  s = multiline
    ? s.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{3,}/g, "\n\n").trim()
    : s.replace(/\s+/g, " ").trim();
  if (s.length < min) throw bad(min === 1 ? `${label} is required` : `${label} must be at least ${min} characters`);
  if (s.length > max) throw bad(`${label} must be at most ${max} characters`);
  return s;
}
export const optText = (v: unknown, label: string, opts: TextOpts) => missing(v) ? null : text(v, label, opts);

// Non-throwing clean-up for text from trusted third parties (e.g. a Google profile name).
export const clip = (v: unknown, max: number) => String(v ?? "").normalize("NFC").replace(HIDDEN, "").replace(/\s+/g, " ").trim().slice(0, max);

type NumOpts = { min: number; max: number; integer?: boolean };
export function num(v: unknown, label: string, { min, max, integer = false }: NumOpts): number {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v.trim()) : NaN;
  if (!Number.isFinite(n)) throw bad(`${label} must be a number`);
  if (integer && !Number.isInteger(n)) throw bad(`${label} must be a whole number`);
  if (n < min || n > max) throw bad(`${label} must be between ${min} and ${max}`);
  return n;
}
export const optNum = (v: unknown, label: string, opts: NumOpts) => missing(v) ? null : num(v, label, opts);

export function oneOf<T extends string>(v: unknown, label: string, allowed: readonly T[]): T {
  if (typeof v !== "string" || !allowed.includes(v as T)) throw bad(`${label} must be one of: ${allowed.join(", ")}`);
  return v as T;
}
export const optOneOf = <T extends string>(v: unknown, label: string, allowed: readonly T[], fallback: T) =>
  missing(v) ? fallback : oneOf(v, label, allowed);

export function email(v: unknown): string {
  const e = typeof v === "string" ? v.normalize("NFC").replace(HIDDEN, "").trim().toLowerCase() : "";
  if (e.length > 254 || !/^[^\s@"<>()[\]\\,;:]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(e)) throw bad("Enter a valid email address");
  return e;
}

// New passwords: 6–128 characters (the cap keeps scrypt hashing cheap and bounded).
export function newPassword(v: unknown): string {
  if (typeof v !== "string") throw bad("Password must be text");
  if (v.length < 6) throw bad("Password must be at least 6 characters");
  if (v.length > 128) throw bad("Password must be at most 128 characters");
  return v;
}

// Optional phone: spaces, dashes, dots and brackets dropped; 7–15 digits, optional leading +.
export function optPhone(v: unknown): string | null {
  if (missing(v)) return null;
  const p = typeof v === "string" || typeof v === "number" ? String(v).replace(/[\s\-.()]/g, "") : "";
  if (!/^\+?\d{7,15}$/.test(p)) throw bad("Enter a valid phone number");
  return p;
}

export function pincode(v: unknown): string {
  const p = typeof v === "string" || typeof v === "number" ? String(v).trim() : "";
  if (!/^\d{6}$/.test(p)) throw bad("Pincode must be 6 digits");
  return p;
}

// Ids we issue (listings, invoices, leads, chat sessions): letters, digits, - and _.
export function id(v: unknown, label = "Id"): string {
  if (typeof v !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(v)) throw bad(`${label} is invalid`);
  return v;
}
export const optId = (v: unknown, label?: string) => missing(v) ? null : id(v, label);

export const lat = (v: unknown) => num(v, "Latitude", { min: -90, max: 90 });
export const lng = (v: unknown) => num(v, "Longitude", { min: -180, max: 180 });

// SQL LIKE/ILIKE wildcards in user text are matched literally (Postgres' default escape is \).
export const likeEscape = (s: string) => s.replace(/[\\%_]/g, "\\$&");

export const LISTING_TYPES = ["buy", "rent"] as const;
export const CATEGORIES = ["resale", "new"] as const;
export const FURNISHING = ["unfurnished", "semi", "furnished"] as const;
export const POSTED_BY = ["owner", "realtor"] as const;
export const SEGMENTS = ["residential", "commercial"] as const;
export const ALL_PROPERTY_TYPES = [...PROPERTY_TYPES.residential, ...PROPERTY_TYPES.commercial];

// Every editable listing field, validated and normalised. Used when a listing is
// created and when an admin edits one, so both paths enforce the same rules.
// `defaults` lets the public Post form omit furnishing/role/segment.
export function listingFields(body: any, defaults = false) {
  const segment = defaults ? optOneOf(body.segment, "Residential/commercial", SEGMENTS, "residential") : oneOf(body.segment, "Residential/commercial", SEGMENTS);
  const segErr = checkSegmentType(segment, body.propertyType);
  if (segErr) throw bad(segErr);
  const beds = num(body.beds, "Bedrooms", { min: 0, max: 20 });
  if (!Number.isInteger(beds * 2)) throw bad("Bedrooms must be a whole or half number");
  return {
    title: text(body.title, "Title", { max: 120, min: 3 }),
    type: oneOf(body.type, "Listing for", LISTING_TYPES),
    category: oneOf(body.category, "Resale or new", CATEGORIES),
    city: text(body.city, "City", { max: 60 }),
    area: text(body.area, "Area / locality", { max: 80 }),
    pincode: pincode(body.pincode),
    priceINR: num(body.priceINR, "Price", { min: 1000, max: 1e11, integer: true }),
    sqft: num(body.sqft, "Built-up area", { min: 1, max: 10_000_000, integer: true }),
    beds,
    baths: num(body.baths, "Bathrooms", { min: 0, max: 20, integer: true }),
    desc: text(body.desc, "Description", { max: 5000, multiline: true }),
    furnishing: defaults ? optOneOf(body.furnishing, "Furnishing", FURNISHING, "unfurnished") : oneOf(body.furnishing, "Furnishing", FURNISHING),
    role: defaults ? optOneOf(body.role, "Posted by", POSTED_BY, "owner") : oneOf(body.role, "Posted by", POSTED_BY),
    segment,
    propertyType: body.propertyType as string
  };
}
