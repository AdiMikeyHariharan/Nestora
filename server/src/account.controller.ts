import { Body, Controller, Get, Post, Query, Req, HttpException } from "@nestjs/common";
import * as crypto from "node:crypto";
import { DbService } from "./db.service";

const err = (code: number, msg: string) => new HttpException({ error: msg }, code);
const VISIT_FEE_INR = 999; // refundable site-visit token amount

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
}
