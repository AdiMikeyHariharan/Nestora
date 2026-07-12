import { Body, Controller, Get, Post, Query, Req, HttpException } from "@nestjs/common";
import * as crypto from "node:crypto";
import { DbService } from "./db.service";

const err = (code: number, msg: string) => new HttpException({ error: msg }, code);
// Free while we collect data/leads. Set VISIT_FEE_INR > 0 (env) to re-enable the
// refundable site-visit token + checkout flow — the payment plumbing stays intact.
const VISIT_FEE_INR = parseInt(process.env.VISIT_FEE_INR || "0", 10);

@Controller()
export class AccountController {
  constructor(private db: DbService) {}

  private async requireUser(req: any) {
    const user = await this.db.userFromRequest(req);
    if (!user) throw err(401, "Login required");
    return user;
  }

  // ---- Shortlist ----
  @Get("shortlist")
  async shortlist(@Req() req: any) {
    const user = await this.requireUser(req);
    const { rows } = await this.db.q("SELECT property_id FROM shortlist WHERE email = $1", [user.email]);
    return { ids: rows.map(r => r.property_id) };
  }

  @Post("shortlist")
  async toggle(@Body() body: any, @Req() req: any) {
    const user = await this.requireUser(req);
    const id = body.property_id;
    const { rows } = await this.db.q("SELECT 1 FROM shortlist WHERE email = $1 AND property_id = $2", [user.email, id]);
    if (rows.length) {
      await this.db.q("DELETE FROM shortlist WHERE email = $1 AND property_id = $2", [user.email, id]);
      return { shortlisted: false };
    }
    await this.db.q("INSERT INTO shortlist (email, property_id) VALUES ($1,$2)", [user.email, id]);
    return { shortlisted: true };
  }

  // ---- Bookings + invoices ----
  @Post("bookings")
  async book(@Body() body: any, @Req() req: any) {
    const user = await this.requireUser(req);
    const { rows: [prop] } = await this.db.q("SELECT * FROM properties WHERE id = $1", [body.property_id]);
    if (!prop) throw err(404, "Property not found");
    const bid = this.db.uid("visit");

    // Free mode: confirm the booking immediately, no invoice/payment.
    if (VISIT_FEE_INR <= 0) {
      await this.db.q("INSERT INTO bookings (id,email,property_id,date_pref,status) VALUES ($1,$2,$3,$4,'confirmed')",
        [bid, user.email, prop.id, body.date_pref || ""]);
      this.db.sendEmail(user.email, "Visit confirmed — " + prop.title,
        `Hi ${user.name}, your site visit for ${prop.title} (${prop.area}, ${prop.city}) is confirmed. Our advisor will call to finalise the time.`);
      return { booking_id: bid, amount: 0, free: true };
    }

    // Paid mode: booking awaits a refundable-token payment.
    await this.db.q("INSERT INTO bookings (id,email,property_id,date_pref,status) VALUES ($1,$2,$3,$4,'awaiting_payment')",
      [bid, user.email, prop.id, body.date_pref || ""]);
    const iid = this.db.uid("inv");
    await this.db.q("INSERT INTO invoices (id,email,booking_id,description,amount) VALUES ($1,$2,$3,$4,$5)",
      [iid, user.email, bid, `Site-visit token — ${prop.title} (${prop.area}, ${prop.city})`, VISIT_FEE_INR]);
    this.db.sendEmail(user.email, "Visit request received — " + prop.title,
      `Hi ${user.name}, your site-visit request for ${prop.title} is in. Pay the refundable token of ₹${VISIT_FEE_INR} to confirm your slot.`);
    return { booking_id: bid, invoice_id: iid, amount: VISIT_FEE_INR };
  }

  @Get("bookings")
  async bookings(@Req() req: any) {
    const user = await this.requireUser(req);
    const { rows } = await this.db.q(`
      SELECT b.*, p.title, p.area, p.city, p.img FROM bookings b
      LEFT JOIN properties p ON p.id = b.property_id
      WHERE b.email = $1 ORDER BY b.created_at DESC`, [user.email]);
    return { bookings: rows };
  }

  @Get("invoices")
  async invoices(@Req() req: any) {
    const user = await this.requireUser(req);
    const { rows } = await this.db.q("SELECT * FROM invoices WHERE email = $1 ORDER BY created_at DESC", [user.email]);
    return { invoices: rows };
  }

  // Mock payment capture. PRODUCTION: create a Razorpay order here, verify the
  // gateway signature in a webhook, and only then mark the invoice paid.
  @Post("payments/pay")
  async pay(@Body() body: any, @Req() req: any) {
    const user = await this.requireUser(req);
    const { rows: [inv] } = await this.db.q("SELECT * FROM invoices WHERE id = $1 AND email = $2", [body.invoice_id, user.email]);
    if (!inv) throw err(404, "Invoice not found");
    if (inv.status === "paid") throw err(400, "Already paid");
    const ref = "pay_" + crypto.randomBytes(8).toString("hex");
    await this.db.q("UPDATE invoices SET status='paid', method=$1, gateway_ref=$2, paid_at=now() WHERE id=$3",
      [body.method || "card", ref, inv.id]);
    if (inv.booking_id) await this.db.q("UPDATE bookings SET status='confirmed' WHERE id=$1", [inv.booking_id]);
    this.db.sendEmail(user.email, "Payment received — " + inv.id,
      `We received ₹${inv.amount} (ref ${ref}). Your site visit is confirmed — our advisor will call to fix the slot.`);
    return { ok: true, gateway_ref: ref };
  }

  // ---- AI chat (Claude API). Set ANTHROPIC_API_KEY to enable; the client
  // falls back to the built-in rule-based search when this returns 501. ----
  @Post("chat/ask")
  async chatAsk(@Body() body: any) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw err(501, "AI chat not configured — set ANTHROPIC_API_KEY");
    const { rows } = await this.db.q(
      "SELECT id,title,type,category,city,area,pincode,price_inr,beds,baths,sqft,furnishing FROM properties ORDER BY created_at DESC LIMIT 60");
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        system: `You are Nestora's professional real-estate assistant (India). Be concise, warm and factual — no emoji.
Answer only from this live inventory (price_inr is INR; type buy=sale, rent=monthly):
${JSON.stringify(rows)}
When recommending homes, end with a line: PROPS:<comma-separated ids> so the UI can render cards. If asked to book a visit, explain: open the property page and select "Schedule a visit" (refundable ₹999 token confirms the slot).`,
        messages: (body.messages || []).slice(-12)
      })
    });
    if (!resp.ok) throw err(502, "AI service unavailable");
    const data: any = await resp.json();
    const text = data.content?.[0]?.text || "";
    const ids = (text.match(/PROPS:([\w,-]+)/)?.[1] || "").split(",").filter(Boolean);
    return { reply: text.replace(/PROPS:[\w,-]+/g, "").trim(), propertyIds: ids };
  }

  // ---- Chatbot conversation log ----
  @Post("chat/log")
  async chatLog(@Body() body: any) {
    if (!body.session || !body.who || !body.text) throw err(400, "session, who, text required");
    await this.db.q("INSERT INTO chat_messages (session, who, text) VALUES ($1,$2,$3)",
      [String(body.session).slice(0, 64), body.who === "me" ? "user" : "bot", String(body.text).slice(0, 2000)]);
    return { ok: true };
  }

  @Get("chat/history")
  async chatHistory(@Query("session") session: string) {
    if (!session) throw err(400, "session required");
    const { rows } = await this.db.q(
      "SELECT who, text, created_at FROM chat_messages WHERE session = $1 ORDER BY id ASC LIMIT 200", [session]);
    return { messages: rows };
  }

  // ---- First-party analytics (cookie-based, consent-gated on the client) ----
  @Post("analytics/track")
  async track(@Body() body: any) {
    if (!body || !body.path) return { ok: false };
    await this.db.q(
      "INSERT INTO analytics_events (visitor_id, session_id, path, referrer, event, meta) VALUES ($1,$2,$3,$4,$5,$6)",
      [String(body.vid || "").slice(0, 64), String(body.sid || "").slice(0, 64),
       String(body.path).slice(0, 300), String(body.referrer || "").slice(0, 300),
       String(body.event || "pageview").slice(0, 40), body.meta || {}]);
    return { ok: true };
  }

  @Get("analytics/summary")
  async analyticsSummary() {
    const [views, visitors, top, daily] = await Promise.all([
      this.db.q("SELECT COUNT(*)::int AS c FROM analytics_events WHERE event = 'pageview'"),
      this.db.q("SELECT COUNT(DISTINCT visitor_id)::int AS c FROM analytics_events WHERE visitor_id <> ''"),
      this.db.q("SELECT path, COUNT(*)::int AS views FROM analytics_events WHERE event = 'pageview' GROUP BY path ORDER BY views DESC LIMIT 10"),
      this.db.q("SELECT to_char(created_at::date, 'YYYY-MM-DD') AS day, COUNT(*)::int AS views FROM analytics_events WHERE event = 'pageview' AND created_at > now() - interval '14 days' GROUP BY day ORDER BY day")
    ]);
    return {
      totalViews: views.rows[0].c,
      uniqueVisitors: visitors.rows[0].c,
      topPaths: top.rows,
      daily: daily.rows
    };
  }
}
