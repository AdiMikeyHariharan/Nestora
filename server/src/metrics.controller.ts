import { Body, Controller, Get, Post, Query, Req, HttpException } from "@nestjs/common";
import { DbService } from "./db.service";

const err = (code: number, msg: string) => new HttpException({ error: msg }, code);
const BOT_UA = /bot|crawl|spider|slurp|preview|headless|lighthouse/i;
// Days are counted in India time so "today" matches the business day.
const TZ = "Asia/Kolkata";

@Controller()
export class MetricsController {
  constructor(private db: DbService) {}

  // Page-view beacon, sent by the client on every route change.
  @Post("track")
  async track(@Body() body: any, @Req() req: any) {
    const visitor = String(body.visitor || "").slice(0, 64);
    const path = String(body.path || "").slice(0, 300);
    if (!visitor || !path.startsWith("/") || BOT_UA.test(req.headers["user-agent"] || "")) return { ok: true };
    const user = await this.db.userFromRequest(req);
    if (user?.role === "admin") return { ok: true };
    const propertyId = path.match(/^\/property\/([^/?#]+)/)?.[1] || null;
    // A seller opening their own listing shouldn't inflate its numbers.
    if (propertyId && user) {
      const { rows: [own] } = await this.db.q("SELECT 1 FROM properties WHERE id = $1 AND posted_by = $2", [propertyId, user.email]);
      if (own) return { ok: true };
    }
    await this.db.q("INSERT INTO page_views (visitor_id, email, path, property_id) VALUES ($1, $2, $3, $4)",
      [visitor, user?.email || null, path, propertyId]);
    return { ok: true };
  }

  @Get("admin/metrics")
  async metrics(@Query("days") daysStr: string, @Req() req: any) {
    const user = await this.db.userFromRequest(req);
    if (!user) throw err(401, "Login required");
    if (user.role !== "admin") throw err(403, "Admins only");
    const days = Math.min(365, Math.max(1, parseInt(daysStr, 10) || 30));
    const since = `(now() AT TIME ZONE '${TZ}')::date - ($1::int - 1)`;
    const inRange = (col: string) => `(${col} AT TIME ZONE '${TZ}')::date >= ${since}`;

    const [{ rows: [summary] }, { rows: daily }, { rows: listings }] = await Promise.all([
      this.db.q(`SELECT
          count(DISTINCT visitor_id)::int AS visitors,
          count(*)::int AS pageviews,
          count(*) FILTER (WHERE property_id IS NOT NULL)::int AS listing_views,
          count(DISTINCT email)::int AS signed_in_visitors,
          count(DISTINCT visitor_id) FILTER (WHERE (created_at AT TIME ZONE '${TZ}')::date = (now() AT TIME ZONE '${TZ}')::date)::int AS visitors_today,
          (SELECT count(*)::int FROM leads WHERE ${inRange("created_at")}) AS interest,
          (SELECT count(*)::int FROM bookings WHERE ${inRange("created_at")}) AS bookings,
          (SELECT count(*)::int FROM users WHERE ${inRange("created_at")}) AS signups,
          (SELECT count(*)::int FROM llm_security_events WHERE ${inRange("created_at")}) AS ai_attacks_blocked
        FROM page_views WHERE ${inRange("created_at")}`, [days]),
      this.db.q(`SELECT to_char(d, 'YYYY-MM-DD') AS day,
          count(DISTINCT pv.visitor_id)::int AS visitors, count(pv.id)::int AS pageviews
        FROM generate_series(${since}, (now() AT TIME ZONE '${TZ}')::date, interval '1 day') d
        LEFT JOIN page_views pv ON (pv.created_at AT TIME ZONE '${TZ}')::date = d::date
        GROUP BY d ORDER BY d`, [days]),
      this.db.q(`SELECT p.id, p.title, p.area, p.city,
          COALESCE(v.views, 0)::int AS views, COALESCE(v.visitors, 0)::int AS visitors,
          COALESCE(l.n, 0)::int AS interest, COALESCE(b.n, 0)::int AS bookings, COALESCE(s.n, 0)::int AS saved
        FROM properties p
        LEFT JOIN (SELECT property_id, count(*) AS views, count(DISTINCT visitor_id) AS visitors
          FROM page_views WHERE property_id IS NOT NULL AND ${inRange("created_at")} GROUP BY 1) v ON v.property_id = p.id
        LEFT JOIN (SELECT property_id, count(*) AS n FROM leads WHERE ${inRange("created_at")} GROUP BY 1) l ON l.property_id = p.id
        LEFT JOIN (SELECT property_id, count(*) AS n FROM bookings WHERE ${inRange("created_at")} GROUP BY 1) b ON b.property_id = p.id
        LEFT JOIN (SELECT property_id, count(*) AS n FROM shortlist GROUP BY 1) s ON s.property_id = p.id
        ORDER BY views DESC, interest DESC, p.created_at DESC`, [days])
    ]);
    return { days, summary, daily, listings };
  }
}
