import { Body, Controller, Get, Post, Query, Req, HttpException } from "@nestjs/common";
import * as crypto from "node:crypto";
import { DbService } from "./db.service";
import { CalendarService } from "./calendar.service";

const err = (code: number, msg: string) => new HttpException({ error: msg }, code);
// Free while we collect data/leads. Set VISIT_FEE_INR > 0 (env) to re-enable the
// refundable site-visit token + checkout flow — the payment plumbing stays intact.
const VISIT_FEE_INR = parseInt(process.env.VISIT_FEE_INR || "0", 10);

// "2026-07-19, Morning (10am–12pm)" -> { start:"2026-07-19T10:00:00", end:"...T11:00:00" }
function visitWindow(datePref: string): { startISO: string; endISO: string } | null {
  const date = (datePref || "").split(",")[0].trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const p = (datePref || "").toLowerCase();
  const hour = p.includes("evening") ? 17 : p.includes("afternoon") ? 14 : 10;
  const hh = String(hour).padStart(2, "0");
  return { startISO: `${date}T${hh}:00:00`, endISO: `${date}T${String(hour + 1).padStart(2, "0")}:00:00` };
}

@Controller()
export class AccountController {
  constructor(private db: DbService, private cal: CalendarService) {}

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
      // If the seller has connected Google Calendar, drop the visit on their calendar.
      const win = visitWindow(body.date_pref);
      let calendarAdded = false;
      if (win && prop.posted_by && prop.posted_by !== "seed") {
        calendarAdded = await this.cal.createSellerEvent(prop.posted_by, {
          summary: `Nestora site visit — ${prop.title}`,
          description: `Buyer ${user.name} (${user.email}) booked a visit for ${prop.title}, ${prop.area}, ${prop.city}.\nPreferred: ${body.date_pref}`,
          startISO: win.startISO, endISO: win.endISO, buyerEmail: user.email
        });
      }
      return { booking_id: bid, amount: 0, free: true, calendarAdded };
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

  // ---- AI search assistant. Prefers Groq (reliable free), falls back to
  // Anthropic if configured; returns 501 only when neither key is set, and the
  // client then uses its built-in rule-based search. ----
  @Post("chat/ask")
  async chatAsk(@Body() body: any) {
    const groqKey = process.env.GROQ_API_KEY;
    const anthKey = process.env.ANTHROPIC_API_KEY;
    if (!groqKey && !anthKey) throw err(501, "AI chat not configured — set GROQ_API_KEY");

    const { rows } = await this.db.q(
      "SELECT id,title,type,category,city,area,pincode,price_inr,beds,baths,sqft,furnishing FROM properties ORDER BY created_at DESC LIMIT 60");
    const system = `You are Nestora's professional real-estate assistant (India). Be concise, warm and factual — no emoji.
Answer only from this live inventory (price_inr is INR; type buy=sale, rent=monthly):
${JSON.stringify(rows)}
When recommending homes, end with a line: PROPS:<comma-separated ids> so the UI can render cards. To book a visit, tell them to open the property page and select "Schedule a visit".`;
    const recent = (body.messages || []).slice(-12);

    let text = "";
    try {
      if (groqKey) {
        const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${groqKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "llama-3.3-70b-versatile", max_tokens: 600, temperature: 0.3,
            messages: [{ role: "system", content: system }, ...recent]
          })
        });
        if (!resp.ok) throw new Error("Groq " + resp.status);
        const d: any = await resp.json();
        text = d.choices?.[0]?.message?.content || "";
      } else {
        const resp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": anthKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 500, system, messages: recent })
        });
        if (!resp.ok) throw new Error("Anthropic " + resp.status);
        const data: any = await resp.json();
        text = data.content?.[0]?.text || "";
      }
    } catch (e) {
      throw err(502, "AI service unavailable");
    }

    const ids = (text.match(/PROPS:([\w,-]+)/)?.[1] || "").split(",").filter(Boolean);
    return { reply: text.replace(/PROPS:\s*[\w,\- ]*/gi, "").trim(), propertyIds: ids };
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

  // ---- Leads (for sellers) ----
  @Get("leads")
  async leads(@Req() req: any) {
    const user = await this.requireUser(req);
    const { rows } = await this.db.q(`
      SELECT l.*, p.title as property_title, u.phone as buyer_phone
      FROM leads l
      JOIN properties p ON l.property_id = p.id
      LEFT JOIN users u ON l.buyer_email = u.email
      WHERE l.seller_email = $1
      ORDER BY l.created_at DESC
    `, [user.email]);
    return { leads: rows };
  }

  @Post("leads/:id/status")
  async updateLeadStatus(@Body() body: any, @Req() req: any, @Query("id") id: string) {
    // We can get id from req.params manually since @Param isn't imported, but let's just use @Body
    const user = await this.requireUser(req);
    const leadId = req.params.id || body.id;
    const { status } = body;
    if (!["accepted", "rejected"].includes(status)) throw err(400, "Invalid status");
    
    // Ensure the lead belongs to the current user
    const { rows: [lead] } = await this.db.q("SELECT * FROM leads WHERE id = $1 AND seller_email = $2", [leadId, user.email]);
    if (!lead) throw err(404, "Lead not found or unauthorized");
    
    await this.db.q("UPDATE leads SET status = $1 WHERE id = $2", [status, leadId]);
    return { ok: true, status };
  }
}
