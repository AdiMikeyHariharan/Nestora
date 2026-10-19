import { Controller, Delete, Get, Param, Patch, Post, Query, Body, Req, Res, HttpException } from "@nestjs/common";
import { DbService, LIST_COLUMNS } from "./db.service";
import { GeoService } from "./geo.service";
import * as v from "./validate";
import { cleanUserText, detectInjection, recordInjection } from "./llm-guard";

const err = (code: number, msg: string) => new HttpException({ error: msg }, code);
// Media is stored as base64 data URLs (or https links). SVG is refused: it can carry script.
const isImage = (x: any) => typeof x === "string" && /^(data:image\/(?!svg)[\w.+-]+;base64,|https:\/\/)/i.test(x);
const isVideo = (x: any) => typeof x === "string" && /^(data:video\/[\w.+-]+;base64,|https:\/\/)/i.test(x);
// YouTube links (big walkthroughs that are too large to upload) are stored in one
// canonical form without tracking parameters. Mirrors client/src/lib/youtube.js.
const YT_HOSTS = /^(www\.|m\.|music\.)?(youtube\.com|youtube-nocookie\.com|youtu\.be)$/i;
function normalizeVideo(v: any): string | null {
  if (typeof v !== "string" || !v) return null;
  if (!isVideo(v)) throw err(400, "Unsupported video format");
  if (!/^https:/i.test(v)) return v;
  let u: URL;
  try { u = new URL(v); } catch { throw err(400, "Invalid video link"); }
  if (!YT_HOSTS.test(u.hostname)) return v;
  const id = /youtu\.be$/i.test(u.hostname)
    ? u.pathname.slice(1)
    : u.searchParams.get("v") || u.pathname.match(/^\/(?:shorts|live|embed)\/([^/?#]+)/)?.[1];
  if (!/^[\w-]{11}$/.test(id || "")) throw err(400, "That isn't a valid YouTube video link");
  return `https://www.youtube.com/watch?v=${id}`;
}
// Full listing details (description, gallery, video) are for signed-up users only;
// everyone else — and every list response — gets the card-level teaser.
const teaser = (p: any) => { const { desc, photos, video, ...rest } = p; return rest; };
// What a signed-out visitor (and Google) sees on a listing page: the teaser plus a few
// photos and the start of the description, so the page is worth indexing. The full
// description, video, booking and chat stay members-only.
const preview = (p: any) => {
  const d = String(p.desc || "");
  const cut = d.length > 280 ? d.slice(0, 280).replace(/\s+\S*$/, "") + "…" : d;
  return { ...teaser(p), photos: (p.photos || []).slice(0, 4), descExcerpt: cut };
};

@Controller()
export class PropertiesController {
  constructor(private db: DbService, private geo: GeoService) {}

  // Listing text is fed to the chatbots, so text that reads like instructions to an AI
  // is refused when it's written (the chatbots also withhold it at read time).
  private async rejectInjectedText(email: string, text: string) {
    const hit = await detectInjection(cleanUserText(text, 5000));
    if (!hit) return;
    await recordInjection(this.db, "user:" + email, "listing:" + hit, text);
    throw err(400, "The title or description contains text that looks like instructions to our AI assistant. Please describe the property only.");
  }

  // Sitemap built from live data, so every listing (and each locality we actually
  // have stock in) is discoverable by search engines. Vercel rewrites /sitemap.xml here.
  @Get("sitemap.xml")
  async sitemap(@Res() res: any) {
    // Canonical public host — deliberately NOT PUBLIC_URL, which points at the apex
    // for OAuth callbacks while the site itself canonicalises to www. Listing apex
    // URLs here would make every sitemap entry a 308 redirect.
    const SITE = (process.env.SITE_URL || "https://www.nestora.properties").replace(/\/$/, "");
    const esc = (s: string) => String(s).replace(/[<>&'"]/g, c =>
      ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c] as string));
    const url = (loc: string, priority: string, freq: string, lastmod?: string) =>
      `  <url>\n    <loc>${esc(loc)}</loc>\n` +
      (lastmod ? `    <lastmod>${new Date(lastmod).toISOString().slice(0, 10)}</lastmod>\n` : "") +
      `    <changefreq>${freq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;

    const { rows } = await this.db.q(
      "SELECT id, city, area, type, created_at FROM properties ORDER BY created_at DESC");

    const parts = [
      url(`${SITE}/`, "1.0", "daily"),
      url(`${SITE}/listings`, "0.9", "hourly"),
      url(`${SITE}/post`, "0.6", "weekly")
    ];
    // Locality + city search pages — these are what local queries land on.
    const seen = new Set<string>();
    for (const r of rows) {
      for (const term of [r.city, r.area]) {
        const t = (term || "").trim();
        if (!t || seen.has(t.toLowerCase())) continue;
        seen.add(t.toLowerCase());
        parts.push(url(`${SITE}/listings?q=${encodeURIComponent(t)}`, "0.8", "daily"));
      }
    }
    for (const r of rows) parts.push(url(`${SITE}/property/${r.id}`, "0.7", "weekly", r.created_at));

    res.type("application/xml").send(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${parts.join("\n")}\n</urlset>\n`);
  }

  @Get("geocode")
  async geocode(@Query("q") q: string) {
    const place = v.text(q, "Search", { max: 120 });
    try { return { results: await this.geo.geocode(place) }; }
    catch { throw err(502, "Geocoder unavailable — try again"); }
  }

  @Get("properties")
  async list(@Query() p: Record<string, string>, @Req() req: any) {
    const where: string[] = [], params: any[] = [];
    const add = (sql: string, val: any) => { params.push(val); where.push(sql.replace("?", "$" + params.length)); };
    // Every filter is checked before it reaches the query; text wildcards match literally.
    if (p.q) add("(city || ' ' || area) ILIKE ?", "%" + v.likeEscape(v.text(p.q, "Search", { max: 80 })) + "%");
    if (p.pincode) {
      if (!/^\d{1,6}$/.test(p.pincode)) throw err(400, "Pincode must be digits");
      add("pincode LIKE ?", p.pincode + "%");
    }
    if (p.type) add("type = ?", v.oneOf(p.type, "Listing for", v.LISTING_TYPES));
    if (p.category) add("category = ?", v.oneOf(p.category, "Resale or new", v.CATEGORIES));
    if (p.budget) add("price_inr <= ?", v.num(p.budget, "Budget", { min: 0, max: 1e11 }));
    if (p.minBudget) add("price_inr >= ?", v.num(p.minBudget, "Minimum budget", { min: 0, max: 1e11 }));
    if (p.beds) add("beds = ?", v.num(p.beds, "Bedrooms", { min: 0, max: 20 }));
    if (p.furnishing) add("furnishing = ?", v.oneOf(p.furnishing, "Furnishing", v.FURNISHING));
    if (p.segment) add("segment = ?", v.oneOf(p.segment, "Residential/commercial", v.SEGMENTS));
    if (p.propertyType) add("property_type = ?", v.oneOf(p.propertyType, "Property type", v.ALL_PROPERTY_TYPES));
    // near=<lat>,<lng>&radius=<km>
    let near: [number, number] | null = null;
    const radius = p.radius ? v.num(p.radius, "Radius", { min: 0.1, max: 500 }) : 10;
    if (p.near) {
      const [la, ln] = String(p.near).split(",");
      near = [v.lat(la), v.lng(ln)];
    }
    // Admins get full rows: their listing editors work from this list. Everyone else
    // gets card columns only, with covers as short cacheable URLs (see LIST_COLUMNS).
    const isAdmin = (await this.db.userFromRequest(req))?.role === "admin";
    const { rows } = await this.db.q(
      `SELECT ${isAdmin ? "*" : LIST_COLUMNS} FROM properties ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY created_at DESC`, params);
    let list = rows.map(r => isAdmin ? this.db.toApiProp(r) : teaser(this.db.toApiProp(r)));

    // near → haversine filter + distance sort
    if (near) {
      list = list
        .filter(x => x.lat != null && x.lng != null)
        .map(x => ({ ...x, distance_km: +this.geo.distanceKm(near[0], near[1], x.lat, x.lng).toFixed(1) }))
        .filter(x => x.distance_km <= radius)
        .sort((a, b) => a.distance_km - b.distance_km);
    }
    return { properties: list };
  }

  @Get("properties/recommended")
  async recommended(@Query("lat") latStr: string, @Query("lng") lngStr: string) {
    const lat = v.lat(latStr), lng = v.lng(lngStr);

    const { rows } = await this.db.q(`SELECT ${LIST_COLUMNS} FROM properties ORDER BY created_at DESC`);
    const properties = rows.map(r => teaser(this.db.toApiProp(r)));
    return this.geo.clusterAndRecommend(properties, lat, lng);
  }

  // A listing's uploaded cover photo as an image file. The URL carries a content hash
  // (?v=…), so the response is cached for a year by browsers and Vercel's CDN; a new
  // photo gets a new URL. Link covers redirect; anything that isn't an image gets a placeholder.
  @Get("properties/:id/cover")
  async cover(@Param("id") id: string, @Res() res: any) {
    v.id(id, "Listing id");
    const { rows: [row] } = await this.db.q("SELECT img FROM properties WHERE id = $1", [id]);
    if (!row) throw err(404, "Not found");
    const m = /^data:(image\/(?!svg)[\w.+-]+);base64,(.*)$/is.exec(row.img || "");
    if (!m) return res.redirect(302, /^https:\/\//i.test(row.img || "") ? row.img : `https://picsum.photos/seed/${id}/800/500`);
    const body = Buffer.from(m[2], "base64");
    res.set({
      "Content-Type": m[1].toLowerCase(),
      "Cache-Control": "public, max-age=31536000, immutable",
      "CDN-Cache-Control": "public, max-age=31536000, immutable"
    });
    res.send(body);
  }

  @Get("properties/:id")
  async one(@Param("id") id: string, @Req() req: any) {
    v.id(id, "Listing id");
    const { rows: [row] } = await this.db.q("SELECT * FROM properties WHERE id = $1", [id]);
    if (!row) throw err(404, "Not found");
    // Record who opened the listing for the admin interest sheet. Skip admins and
    // the seller's own views, and count repeat opens within 30 minutes once.
    const user = await this.db.userFromRequest(req);
    // Not signed up (or email not verified yet): teaser only, and the page shows a sign-up wall.
    if (!user?.verified) return { property: preview(this.db.toApiProp(row)), locked: true };
    if (user.role !== "admin" && user.email !== row.posted_by)
      await this.db.q(`INSERT INTO property_views (email, property_id) SELECT $1, $2 WHERE NOT EXISTS (
        SELECT 1 FROM property_views WHERE email = $1 AND property_id = $2 AND created_at > now() - interval '30 minutes')`,
        [user.email, id]);
    return { property: this.db.toApiProp(row) };
  }

  @Post("properties")
  async create(@Body() body: any, @Req() req: any) {
    const user = await this.db.userFromRequest(req);
    if (!user) throw err(401, "Login required");
    if (!user.verified) throw err(403, "Verify your email first");
    const f = v.listingFields(body, true);
    await this.rejectInjectedText(user.email, `${f.title}\n${f.desc}`);
    const photos = Array.isArray(body.photos) ? body.photos : [];
    if (photos.length > 12 || !photos.every(isImage) || (body.img && !isImage(body.img)))
      throw err(400, "Photos must be images (max 12)");
    const video = normalizeVideo(body.video);
    const id = this.db.uid("prop");
    // Coordinates from the client only as a valid pair; otherwise best-effort geocode
    // of the locality so the listing appears in geo search.
    let lat = v.optNum(body.lat, "Latitude", { min: -90, max: 90 }), lng = v.optNum(body.lng, "Longitude", { min: -180, max: 180 });
    if ((lat == null) !== (lng == null)) throw err(400, "Send both latitude and longitude, or neither");
    if (lat == null || lng == null) {
      try {
        const g = await this.geo.geocode(`${f.area}, ${f.city}, India`);
        if (g[0]) { lat = g[0].lat; lng = g[0].lng; }
      } catch { /* listing still saved without coords */ }
    }
    // The listing badge reads "Dealer" only for exactly "realtor" and "Owner" for
    // anything else, so a stray user role here would label a broker's listing as
    // owner-posted. Normalise: agents always post as realtors.
    const listingRole = user.role === "agent" ? "realtor" : f.role;
    await this.db.q(`INSERT INTO properties (id,title,type,category,city,area,pincode,price_inr,beds,baths,sqft,description,img,photos,video,posted_by,role,lat,lng,segment,property_type,furnishing)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
      [id, f.title, f.type, f.category, f.city, f.area, f.pincode, f.priceINR, f.beds, f.baths, f.sqft,
        f.desc, body.img || photos[0] || `https://picsum.photos/seed/${id}/800/500`,
        JSON.stringify(photos), video, user.email, listingRole, lat, lng, f.segment, f.propertyType, f.furnishing]);
    return { id };
  }

  // Admin: edit a listing's details.
  @Patch("properties/:id")
  async updateDetails(@Param("id") id: string, @Body() body: any, @Req() req: any) {
    const user = await this.db.userFromRequest(req);
    if (!user) throw err(401, "Login required");
    if (user.role !== "admin") throw err(403, "Admins only");
    v.id(id, "Listing id");
    const { rows: [row] } = await this.db.q("SELECT city, area, lat, lng FROM properties WHERE id = $1", [id]);
    if (!row) throw err(404, "Not found");

    const f = v.listingFields(body);
    const { title, city, area, pincode, desc } = f;
    await this.rejectInjectedText(user.email, `${title}\n${desc}`);

    // Map/landmark search depends on coordinates, so re-geocode when the locality moves.
    let lat = row.lat, lng = row.lng;
    if (city.toLowerCase() !== (row.city || "").toLowerCase() || area.toLowerCase() !== (row.area || "").toLowerCase()) {
      try {
        const g = await this.geo.geocode(`${area}, ${city}, India`);
        if (g[0]) { lat = g[0].lat; lng = g[0].lng; }
      } catch { /* keep the old coordinates */ }
    }

    // A lower price keeps the old one for the "Price dropped" badge; a higher one clears it.
    // (Right-hand sides in an UPDATE see the old row, so price_inr here is the old price.)
    await this.db.q(`UPDATE properties SET title=$1, type=$2, category=$3, city=$4, area=$5, pincode=$6, price_inr=$7,
      prev_price_inr = CASE WHEN $7 < price_inr THEN price_inr WHEN $7 > price_inr THEN NULL ELSE prev_price_inr END,
      price_changed_at = CASE WHEN $7 <> price_inr THEN now() ELSE price_changed_at END,
      beds=$8, baths=$9, sqft=$10, description=$11, furnishing=$12, role=$13, lat=$14, lng=$15, segment=$16, property_type=$17 WHERE id=$18`,
      [title, f.type, f.category, city, area, pincode, f.priceINR, f.beds, f.baths, f.sqft, desc, f.furnishing, f.role, lat, lng,
        f.segment, f.propertyType, id]);
    const { rows: [updated] } = await this.db.q("SELECT * FROM properties WHERE id = $1", [id]);
    return { property: this.db.toApiProp(updated) };
  }

  // Admin: replace a listing's photos (first one becomes the cover) and video.
  @Patch("properties/:id/media")
  async updateMedia(@Param("id") id: string, @Body() body: any, @Req() req: any) {
    const user = await this.db.userFromRequest(req);
    if (!user) throw err(401, "Login required");
    if (user.role !== "admin") throw err(403, "Admins only");
    v.id(id, "Listing id");
    const { rows: [row] } = await this.db.q("SELECT img FROM properties WHERE id = $1", [id]);
    if (!row) throw err(404, "Not found");
    const photos: string[] = Array.isArray(body.photos) ? body.photos.filter((x: any) => typeof x === "string" && x) : [];
    if (photos.length > 12) throw err(400, "Max 12 photos");
    if (!photos.every(isImage)) throw err(400, "Photos must be images");
    const video = normalizeVideo(body.video);
    await this.db.q("UPDATE properties SET photos = $1, img = $2, video = $3 WHERE id = $4",
      [JSON.stringify(photos), photos[0] || row.img, video, id]);
    return { ok: true };
  }

  @Delete("properties/:id")
  async remove(@Param("id") id: string, @Req() req: any) {
    const user = await this.db.userFromRequest(req);
    if (!user) throw err(401, "Login required");
    v.id(id, "Listing id");
    const { rows: [row] } = await this.db.q("SELECT posted_by FROM properties WHERE id = $1", [id]);
    if (!row) throw err(404, "Not found");
    if (row.posted_by !== user.email) throw err(403, "Not your listing");
    await this.db.q("DELETE FROM properties WHERE id = $1", [id]);
    return { ok: true };
  }
}
