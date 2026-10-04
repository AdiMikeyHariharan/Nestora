import { Controller, Delete, Get, Param, Patch, Post, Query, Body, Req, Res, HttpException } from "@nestjs/common";
import { DbService } from "./db.service";
import { GeoService } from "./geo.service";

const err = (code: number, msg: string) => new HttpException({ error: msg }, code);

@Controller()
export class PropertiesController {
  constructor(private db: DbService, private geo: GeoService) {}

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
  async geocode(@Query("q") text: string) {
    if (!text) throw err(400, "q required");
    try { return { results: await this.geo.geocode(text) }; }
    catch { throw err(502, "Geocoder unavailable — try again"); }
  }

  @Get("properties")
  async list(@Query() p: Record<string, string>) {
    const where: string[] = [], params: any[] = [];
    const add = (sql: string, val: any) => { params.push(val); where.push(sql.replace("?", "$" + params.length)); };
    if (p.q) add("(city || ' ' || area) ILIKE ?", "%" + p.q + "%");
    if (p.pincode) add("pincode LIKE ?", p.pincode + "%");
    if (p.type) add("type = ?", p.type);
    if (p.category) add("category = ?", p.category);
    if (p.budget) add("price_inr <= ?", parseInt(p.budget, 10));
    if (p.minBudget) add("price_inr >= ?", parseInt(p.minBudget, 10));
    if (p.beds) add("beds = ?", parseFloat(p.beds));
    if (p.furnishing) add("furnishing = ?", p.furnishing);
    const { rows } = await this.db.q(
      `SELECT * FROM properties ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY created_at DESC`, params);
    let list = rows.map(r => this.db.toApiProp(r));

    // near=<lat>,<lng>&radius=<km> → haversine filter + distance sort
    const near = (p.near || "").split(",").map(Number);
    if (near.length === 2 && !near.some(isNaN)) {
      const radius = parseFloat(p.radius || "10");
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
    if (!latStr || !lngStr) throw err(400, "lat and lng are required");
    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);
    if (isNaN(lat) || isNaN(lng)) throw err(400, "Invalid lat or lng");

    const { rows } = await this.db.q("SELECT * FROM properties ORDER BY created_at DESC");
    const properties = rows.map(r => this.db.toApiProp(r));
    return this.geo.clusterAndRecommend(properties, lat, lng);
  }

  @Get("properties/:id")
  async one(@Param("id") id: string) {
    const { rows: [row] } = await this.db.q("SELECT * FROM properties WHERE id = $1", [id]);
    if (!row) throw err(404, "Not found");
    return { property: this.db.toApiProp(row) };
  }

  @Post("properties")
  async create(@Body() body: any, @Req() req: any) {
    const user = await this.db.userFromRequest(req);
    if (!user) throw err(401, "Login required");
    if (!user.verified) throw err(403, "Verify your email first");
    for (const f of ["title", "type", "category", "city", "area", "pincode", "priceINR", "beds", "baths", "sqft", "desc"])
      if (body[f] === undefined || body[f] === "") throw err(400, "Missing field: " + f);
    const id = this.db.uid("prop");
    // best-effort geocode of the locality so the listing appears in geo search
    let lat = body.lat ?? null, lng = body.lng ?? null;
    if (lat == null || lng == null) {
      try {
        const g = await this.geo.geocode(`${body.area}, ${body.city}, India`);
        if (g[0]) { lat = g[0].lat; lng = g[0].lng; }
      } catch { /* listing still saved without coords */ }
    }
    // The listing badge reads "Dealer" only for exactly "realtor" and "Owner" for
    // anything else, so a stray user role here would label a broker's listing as
    // owner-posted. Normalise: agents always post as realtors.
    const listingRole = user.role === "agent" ? "realtor"
      : body.role === "realtor" ? "realtor" : "owner";
    await this.db.q(`INSERT INTO properties (id,title,type,category,city,area,pincode,price_inr,beds,baths,sqft,description,img,photos,video,posted_by,role,lat,lng,furnishing)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,${["unfurnished", "semi", "furnished"].includes(body.furnishing) ? "'" + body.furnishing + "'" : "'unfurnished'"})`,
      [id, body.title, body.type, body.category, body.city, body.area, body.pincode,
        parseInt(body.priceINR, 10), parseFloat(body.beds), parseInt(body.baths, 10), parseInt(body.sqft, 10),
        body.desc, body.img || body.photos?.[0] || `https://picsum.photos/seed/${id}/800/500`,
        JSON.stringify(body.photos || []), body.video || null, user.email, listingRole, lat, lng]);
    return { id };
  }

  // Admin: edit a listing's details.
  @Patch("properties/:id")
  async updateDetails(@Param("id") id: string, @Body() body: any, @Req() req: any) {
    const user = await this.db.userFromRequest(req);
    if (!user) throw err(401, "Login required");
    if (user.role !== "admin") throw err(403, "Admins only");
    const { rows: [row] } = await this.db.q("SELECT city, area, lat, lng FROM properties WHERE id = $1", [id]);
    if (!row) throw err(404, "Not found");

    const text = (k: string) => String(body[k] ?? "").trim();
    const num = (k: string) => Number(body[k]);
    const title = text("title"), city = text("city"), area = text("area"), pincode = text("pincode"), desc = text("desc");
    if (!title || !city || !area || !desc) throw err(400, "Title, city, area and description are required");
    if (!/^\d{6}$/.test(pincode)) throw err(400, "Pincode must be 6 digits");
    if (!["buy", "rent"].includes(body.type)) throw err(400, "Type must be buy or rent");
    if (!["resale", "new"].includes(body.category)) throw err(400, "Category must be resale or new");
    if (!["owner", "realtor"].includes(body.role)) throw err(400, "Posted by must be owner or realtor");
    if (!["unfurnished", "semi", "furnished"].includes(body.furnishing)) throw err(400, "Invalid furnishing");
    const price = Math.round(num("priceINR")), sqft = Math.round(num("sqft")), beds = num("beds"), baths = Math.round(num("baths"));
    if (!(price > 0) || !(sqft > 0)) throw err(400, "Price and size must be positive numbers");
    if (!(beds >= 0) || !(baths >= 0)) throw err(400, "Bedrooms and bathrooms can't be negative");

    // Map/landmark search depends on coordinates, so re-geocode when the locality moves.
    let lat = row.lat, lng = row.lng;
    if (city.toLowerCase() !== (row.city || "").toLowerCase() || area.toLowerCase() !== (row.area || "").toLowerCase()) {
      try {
        const g = await this.geo.geocode(`${area}, ${city}, India`);
        if (g[0]) { lat = g[0].lat; lng = g[0].lng; }
      } catch { /* keep the old coordinates */ }
    }

    await this.db.q(`UPDATE properties SET title=$1, type=$2, category=$3, city=$4, area=$5, pincode=$6, price_inr=$7,
      beds=$8, baths=$9, sqft=$10, description=$11, furnishing=$12, role=$13, lat=$14, lng=$15 WHERE id=$16`,
      [title, body.type, body.category, city, area, pincode, price, beds, baths, sqft, desc, body.furnishing, body.role, lat, lng, id]);
    const { rows: [updated] } = await this.db.q("SELECT * FROM properties WHERE id = $1", [id]);
    return { property: this.db.toApiProp(updated) };
  }

  // Admin: replace a listing's photos (first one becomes the cover) and video.
  @Patch("properties/:id/media")
  async updateMedia(@Param("id") id: string, @Body() body: any, @Req() req: any) {
    const user = await this.db.userFromRequest(req);
    if (!user) throw err(401, "Login required");
    if (user.role !== "admin") throw err(403, "Admins only");
    const { rows: [row] } = await this.db.q("SELECT img FROM properties WHERE id = $1", [id]);
    if (!row) throw err(404, "Not found");
    const photos: string[] = Array.isArray(body.photos) ? body.photos.filter((x: any) => typeof x === "string" && x) : [];
    if (photos.length > 12) throw err(400, "Max 12 photos");
    const video = typeof body.video === "string" && body.video ? body.video : null;
    await this.db.q("UPDATE properties SET photos = $1, img = $2, video = $3 WHERE id = $4",
      [JSON.stringify(photos), photos[0] || row.img, video, id]);
    return { ok: true };
  }

  @Delete("properties/:id")
  async remove(@Param("id") id: string, @Req() req: any) {
    const user = await this.db.userFromRequest(req);
    if (!user) throw err(401, "Login required");
    const { rows: [row] } = await this.db.q("SELECT posted_by FROM properties WHERE id = $1", [id]);
    if (!row) throw err(404, "Not found");
    if (row.posted_by !== user.email) throw err(403, "Not your listing");
    await this.db.q("DELETE FROM properties WHERE id = $1", [id]);
    return { ok: true };
  }
}
