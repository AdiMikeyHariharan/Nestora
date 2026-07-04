import { Controller, Delete, Get, Param, Post, Query, Body, Req, HttpException } from "@nestjs/common";
import { DbService } from "./db.service";
import { GeoService } from "./geo.service";

const err = (code: number, msg: string) => new HttpException({ error: msg }, code);

@Controller()
export class PropertiesController {
  constructor(private db: DbService, private geo: GeoService) {}

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
    if (p.beds) add("beds = ?", parseInt(p.beds, 10));
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
    await this.db.q(`INSERT INTO properties (id,title,type,category,city,area,pincode,price_inr,beds,baths,sqft,description,img,photos,video,posted_by,role,lat,lng)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
      [id, body.title, body.type, body.category, body.city, body.area, body.pincode,
        parseInt(body.priceINR, 10), parseInt(body.beds, 10), parseInt(body.baths, 10), parseInt(body.sqft, 10),
        body.desc, body.img || body.photos?.[0] || `https://picsum.photos/seed/${id}/800/500`,
        JSON.stringify(body.photos || []), body.video || null, user.email, body.role || user.role, lat, lng]);
    return { id };
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
