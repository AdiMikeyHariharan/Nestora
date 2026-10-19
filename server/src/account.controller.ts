import { Body, Controller, Get, Post, Query, Req, Res, HttpException } from "@nestjs/common";
import * as ExcelJS from "exceljs";
import {
  cleanHistory, cleanUserText, detectInjection, recordInjection, isChatPaused, clientIp, PAUSED_MSG,
  MAX_HISTORY, OFF_TOPIC_REPLY, PROMPT_RULES, guardReply, signReply, takeLlmCall, llmSignal
} from "./llm-guard";
import { relevantListings, inventoryTable, fitHistory } from "./prompt-context";
import * as v from "./validate";
import { seesLocation, hideAreaInTitle } from "./properties.controller";

// Prompt budgets for the search assistant: ~2.5k chars of history, and answers are a
// PROPS line plus 1–3 sentences (cards carry the details). Output tokens count against
// Groq's per-minute limit too, so the cap is kept tight.
const HISTORY_CHARS = 2500;
const MAX_ANSWER_TOKENS = 200;
import * as crypto from "node:crypto";
import { DbService, coverSql } from "./db.service";
import { CalendarService } from "./calendar.service";

const err = (code: number, msg: string) => new HttpException({ error: msg }, code);
// Free while we collect data/leads. Set VISIT_FEE_INR > 0 (env) to re-enable the
// refundable site-visit token + checkout flow — the payment plumbing stays intact.
const VISIT_FEE_INR = parseInt(process.env.VISIT_FEE_INR || "0", 10);
// Groq retires models periodically (llama-3.3-70b-versatile was decommissioned and
// broke chat in production). Override with GROQ_MODEL instead of editing code.
export const GROQ_MODEL = process.env.GROQ_MODEL || "qwen/qwen3.8-27b";

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
    const id = v.id(body.property_id, "Listing id");
    const { rows } = await this.db.q("SELECT 1 FROM shortlist WHERE email = $1 AND property_id = $2", [user.email, id]);
    if (rows.length) {
      await this.db.q("DELETE FROM shortlist WHERE email = $1 AND property_id = $2", [user.email, id]);
      return { shortlisted: false };
    }
    // Only real listings can be saved (removal above still works for deleted ones).
    const { rows: exists } = await this.db.q("SELECT 1 FROM properties WHERE id = $1", [id]);
    if (!exists.length) throw err(404, "Listing not found");
    await this.db.q("INSERT INTO shortlist (email, property_id) VALUES ($1,$2)", [user.email, id]);
    return { shortlisted: true };
  }

  // ---- Bookings + invoices ----
  @Post("bookings")
  async book(@Body() body: any, @Req() req: any) {
    const user = await this.requireUser(req);
    const { rows: [prop] } = await this.db.q("SELECT * FROM properties WHERE id = $1", [v.id(body.property_id, "Listing id")]);
    if (!prop) throw err(404, "Property not found");
    // Free text from the visit form ("2026-10-20, Morning (10am–12pm)"); it goes into
    // the booking, an email and the seller's calendar event.
    body.date_pref = v.optText(body.date_pref, "Preferred date", { max: 80 }) ?? "";
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
      SELECT b.*, p.title, p.area, p.city, ${coverSql("p")} AS img FROM bookings b
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
    const method = v.optOneOf(body.method, "Payment method", ["upi", "card", "netbanking"] as const, "card");
    const { rows: [inv] } = await this.db.q("SELECT * FROM invoices WHERE id = $1 AND email = $2", [v.id(body.invoice_id, "Invoice id"), user.email]);
    if (!inv) throw err(404, "Invoice not found");
    if (inv.status === "paid") throw err(400, "Already paid");
    const ref = "pay_" + crypto.randomBytes(8).toString("hex");
    await this.db.q("UPDATE invoices SET status='paid', method=$1, gateway_ref=$2, paid_at=now() WHERE id=$3",
      [method, ref, inv.id]);
    if (inv.booking_id) await this.db.q("UPDATE bookings SET status='confirmed' WHERE id=$1", [inv.booking_id]);
    this.db.sendEmail(user.email, "Payment received — " + inv.id,
      `We received ₹${inv.amount} (ref ${ref}). Your site visit is confirmed — our advisor will call to fix the slot.`);
    return { ok: true, gateway_ref: ref };
  }

  // ---- AI search assistant. Prefers Groq (reliable free), falls back to
  // Anthropic if configured; returns 501 only when neither key is set, and the
  // client then uses its built-in rule-based search. ----
  @Post("chat/ask")
  async chatAsk(@Body() body: any, @Req() req: any) {
    const groqKey = process.env.GROQ_API_KEY;
    const anthKey = process.env.ANTHROPIC_API_KEY;
    if (!groqKey && !anthKey) throw err(501, "AI chat not configured — set GROQ_API_KEY");

    const user = await this.db.userFromRequest(req);
    const actor = user ? "user:" + user.email : "ip:" + clientIp(req);
    if (await isChatPaused(this.db, actor)) throw err(429, PAUSED_MSG);

    const raw = Array.isArray(body.messages) ? body.messages : [];
    const lastText = raw[raw.length - 1]?.role === "user" ? cleanUserText(raw[raw.length - 1].content) : "";
    if (!lastText) throw err(400, "messages must end with a user message");
    // Screen every user turn (cached, so earlier turns cost nothing). A hit stops here:
    // no model call, a recorded strike, and `flagged` tells the widget to reset history.
    for (const m of raw.slice(-MAX_HISTORY)) {
      const hit = m?.role === "user" ? await detectInjection(cleanUserText(m.content)) : null;
      if (hit) {
        await recordInjection(this.db, actor, "chat/ask:" + hit, cleanUserText(m.content));
        return { reply: OFF_TOPIC_REPLY, sig: signReply(OFF_TOPIC_REPLY), propertyIds: [], flagged: true };
      }
    }
    // Only user turns and server-signed assistant turns get through (see llm-guard).
    // Recent turns within a character budget, starting with a user turn.
    const recent = fitHistory(cleanHistory(raw), m => m.content, HISTORY_CHARS);
    while (recent.length && recent[0].role !== "user") recent.shift();
    if (recent[recent.length - 1]?.role !== "user") throw err(400, "messages must end with a user message");
    // Out of daily LLM budget → 503, and the widget falls back to its rule-based search.
    if (!takeLlmCall()) throw err(503, "AI assistant is busy — try again later");

    // Only the listings that fit what the visitor asked for (their last few messages),
    // as a compact table — not the whole catalogue as JSON (see prompt-context).
    // Signed-out visitors get no localities at all: they're neither in the prompt nor used
    // for ranking, so the answer (or which listings it picks) can't reveal where homes are.
    const located = seesLocation(user);
    const { rows: fetched } = await this.db.q(
      "SELECT id,title,type,city,area,price_inr,beds,sqft,property_type,furnishing FROM properties ORDER BY created_at DESC LIMIT 500");
    const all = located ? fetched : fetched.map((r: any) => ({ ...r, title: hideAreaInTitle(r.title, r.area, r.city), area: null }));
    const asked = recent.filter(m => m.role === "user").slice(-3).map(m => m.content).join(" ");
    // A signed-out visitor naming a locality gets a fixed answer, not the model — it can
    // neither confirm nor deny what's there (models don't reliably follow that rule).
    const latestAsk = lastText.toLowerCase();
    if (!located && fetched.some((r: any) => r.area && r.area.toLowerCase() !== String(r.city).toLowerCase()
        && r.area.length > 2 && latestAsk.includes(r.area.toLowerCase()))) {
      const reply = "Searching by locality is for members — sign up free (Google or email) to see exactly where each home is. Meanwhile, tell me the city, budget, size or type you want and I'll suggest matches.";
      return { reply, sig: signReply(reply), propertyIds: [] };
    }
    const rows = relevantListings(all, asked);
    const system = `You are Nestora's real-estate assistant (India). Be concise, warm and factual, no emoji.
Answer only from these ${rows.length} listings, the best matches for this conversation out of ${all.length}. If none fit, say so and suggest browsing all listings.
<listing_data>
${inventoryTable(rows)}
</listing_data>
Reply format: when recommending homes, the FIRST line is PROPS:<up to 4 comma-separated ids>; the app shows each as a card with its details. Then 1-3 short plain sentences (no lists, no markdown, don't repeat card details). To book a visit, tell them to open the property page and select "Schedule a visit".
${located ? "" : "This visitor isn't signed in, so localities are hidden from them (and from you). If they ask where a home is, or search by locality, pincode or landmark: never confirm or deny whether any home is in or near a particular place — give the city only, still suggest matching homes by type, budget or size, and say a free sign-up shows exact locations.\n"}${PROMPT_RULES}`;

    let text = "";
    try {
      if (groqKey) {
        const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST", signal: llmSignal(),
          headers: { Authorization: `Bearer ${groqKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: GROQ_MODEL, max_tokens: MAX_ANSWER_TOKENS, temperature: 0.3,
            messages: [{ role: "system", content: system }, ...recent]
          })
        });
        if (!resp.ok) throw new Error("Groq " + resp.status);
        const d: any = await resp.json();
        text = d.choices?.[0]?.message?.content || "";
      } else {
        const resp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST", signal: llmSignal(),
          headers: { "x-api-key": anthKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: MAX_ANSWER_TOKENS, system, messages: recent })
        });
        if (!resp.ok) throw new Error("Anthropic " + resp.status);
        const data: any = await resp.json();
        text = data.content?.[0]?.text || "";
      }
    } catch (e) {
      // Status only (e.g. "Groq 429" = rate limit) — enough to diagnose, no user content.
      console.warn("AI search assistant failed:", (e as any).message);
      throw err(502, "AI service unavailable");
    }

    // Only ids that are really in the inventory, and a filtered reply (links, emails, prompt leaks).
    const ids = (text.match(/PROPS:\s*([\w-]+(?:\s*,\s*[\w-]+)*)/)?.[1] || "").split(",").map(s => s.trim())
      .filter(id => rows.some(r => r.id === id)).slice(0, 6);
    const reply = guardReply(text.replace(/PROPS:\s*[\w,\- ]*/gi, "")) || OFF_TOPIC_REPLY;
    return { reply, sig: signReply(reply), propertyIds: ids };
  }

  // ---- Chatbot conversation log ----
  @Post("chat/log")
  async chatLog(@Body() body: any) {
    const session = v.id(body.session, "Chat session");
    const who = v.oneOf(body.who, "Sender", ["me", "bot"] as const);
    const msg = v.text(body.text, "Message", { max: 2000, multiline: true });
    await this.db.q("INSERT INTO chat_messages (session, who, text) VALUES ($1,$2,$3)",
      [session, who === "me" ? "user" : "bot", msg]);
    return { ok: true };
  }

  @Get("chat/history")
  async chatHistory(@Query("session") session: string, @Req() req: any) {
    // Widget sessions aren't tied to an account, so only admins may read them.
    const user = await this.db.userFromRequest(req);
    if (!user) throw err(401, "Login required");
    if (user.role !== "admin") throw err(403, "Admins only");
    const { rows } = await this.db.q(
      "SELECT who, text, created_at FROM chat_messages WHERE session = $1 ORDER BY id ASC LIMIT 200", [v.id(session, "Chat session")]);
    return { messages: rows };
  }

  // ---- Leads (for sellers) ----
  // ---- Seller stats: how each of my listings is doing ----
  // Views/visitors over the last 30 days (page views, sellers' own visits excluded at
  // tracking time); interested buyers, visits booked and saves are all-time.
  @Get("account/listing-stats")
  async listingStats(@Req() req: any) {
    const user = await this.requireUser(req);
    const { rows } = await this.db.q(`
      SELECT p.id,
        (SELECT count(*)::int FROM page_views v WHERE v.property_id = p.id AND v.created_at > now() - interval '30 days') AS views,
        (SELECT count(DISTINCT v.visitor_id)::int FROM page_views v WHERE v.property_id = p.id AND v.created_at > now() - interval '30 days') AS visitors,
        (SELECT count(*)::int FROM leads l WHERE l.property_id = p.id) AS interested,
        (SELECT count(*)::int FROM bookings b WHERE b.property_id = p.id) AS bookings,
        (SELECT count(*)::int FROM shortlist s WHERE s.property_id = p.id) AS saved
      FROM properties p WHERE p.posted_by = $1`, [user.email]);
    return { stats: Object.fromEntries(rows.map(({ id, ...s }) => [id, s])) };
  }

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
    const leadId = v.id(req.params.id, "Lead id");
    const status = v.oneOf(body.status, "Status", ["accepted", "rejected"] as const);
    
    // Ensure the lead belongs to the current user
    const { rows: [lead] } = await this.db.q("SELECT * FROM leads WHERE id = $1 AND seller_email = $2", [leadId, user.email]);
    if (!lead) throw err(404, "Lead not found or unauthorized");
    
    await this.db.q("UPDATE leads SET status = $1 WHERE id = $2", [status, leadId]);
    return { ok: true, status };
  }

  // ---- Admin: everyone who viewed a listing or submitted interest, as .xlsx ----
  @Get("admin/interest.xlsx")
  async interestSheet(@Req() req: any, @Res() res: any) {
    const user = await this.requireUser(req);
    if (user.role !== "admin") throw err(403, "Admins only");
    const { rows } = await this.db.q(`
      SELECT e.created_at, e.action, e.email, u.name, u.phone, e.property_id, p.title, p.area, p.city, p.type,
        p.price_inr, e.status, e.confidence, e.summary
      FROM (
        SELECT created_at, 'Viewed' AS action, email, property_id, NULL AS status, NULL::int AS confidence, NULL AS summary
        FROM property_views
        UNION ALL
        SELECT created_at, 'Submitted interest', buyer_email, property_id, status, confidence_rating, chat_summary
        FROM leads
      ) e
      LEFT JOIN users u ON u.email = e.email
      LEFT JOIN properties p ON p.id = e.property_id
      ORDER BY e.created_at DESC`);

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Interested people", { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = [
      { header: "Date", key: "date", width: 18, style: { numFmt: "dd-mmm-yyyy hh:mm" } },
      { header: "Action", key: "action", width: 18 },
      { header: "Name", key: "name", width: 22 },
      { header: "Email", key: "email", width: 30 },
      { header: "Phone", key: "phone", width: 16 },
      { header: "Property", key: "title", width: 34 },
      { header: "Property ID", key: "property_id", width: 16 },
      { header: "Locality", key: "area", width: 20 },
      { header: "City", key: "city", width: 14 },
      { header: "Sale / Rent", key: "type", width: 11 },
      { header: "Price (₹)", key: "price", width: 14, style: { numFmt: "#,##0" } },
      { header: "Lead status", key: "status", width: 12 },
      { header: "Confidence (1-10)", key: "confidence", width: 16 },
      { header: "Chat summary", key: "summary", width: 60 }
    ];
    // Excel dates carry no timezone and exceljs writes UTC, so shift to IST for display.
    const IST_MS = 330 * 60 * 1000;
    // Names, titles and AI chat summaries are user/LLM text. Cells are typed strings,
    // but a leading = + - @ is still quoted so no spreadsheet app can read a formula.
    const cell = (v: any) => typeof v === "string" && /^[=+\-@\t\r]/.test(v) ? "'" + v : v;
    for (const r of rows) ws.addRow({
      ...r, date: new Date(new Date(r.created_at).getTime() + IST_MS), name: cell(r.name || ""), phone: cell(r.phone || ""),
      email: cell(r.email), title: cell(r.title || "(deleted listing)"), area: cell(r.area), city: cell(r.city),
      summary: cell(r.summary), type: r.type === "rent" ? "Rent" : r.type ? "Sale" : "",
      price: r.price_inr ?? null
    });
    ws.getRow(1).font = { bold: true };
    ws.autoFilter = { from: "A1", to: "N1" };

    // Second sheet: everyone who has signed up (admins excluded), newest first.
    const { rows: people } = await this.db.q(`SELECT name, email, phone, role, verified, created_at,
        CASE WHEN password IS NULL THEN 'Google' ELSE 'Email' END AS method
      FROM users WHERE role <> 'admin' ORDER BY created_at DESC`);
    const us = wb.addWorksheet("Users", { views: [{ state: "frozen", ySplit: 1 }] });
    us.columns = [
      { header: "Signed up", key: "date", width: 18, style: { numFmt: "dd-mmm-yyyy hh:mm" } },
      { header: "Name", key: "name", width: 24 },
      { header: "Email", key: "email", width: 32 },
      { header: "Phone", key: "phone", width: 16 },
      { header: "Role", key: "role", width: 14 },
      { header: "Sign-in", key: "method", width: 10 },
      { header: "Verified", key: "verified", width: 10 }
    ];
    for (const u of people) us.addRow({
      date: u.created_at ? new Date(new Date(u.created_at).getTime() + IST_MS) : null,
      name: cell(u.name || ""), email: cell(u.email), phone: cell(u.phone || ""),
      role: u.role === "agent" ? "Agent" : "Buyer/Seller", method: u.method, verified: u.verified ? "Yes" : "No"
    });
    us.getRow(1).font = { bold: true };
    us.autoFilter = { from: "A1", to: "G1" };

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="nestora-interest-${new Date().toISOString().slice(0, 10)}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  }
}
