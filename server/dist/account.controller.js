"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AccountController = void 0;
const common_1 = require("@nestjs/common");
const crypto = __importStar(require("node:crypto"));
const db_service_1 = require("./db.service");
const err = (code, msg) => new common_1.HttpException({ error: msg }, code);
// Free while we collect data/leads. Set VISIT_FEE_INR > 0 (env) to re-enable the
// refundable site-visit token + checkout flow — the payment plumbing stays intact.
const VISIT_FEE_INR = parseInt(process.env.VISIT_FEE_INR || "0", 10);
let AccountController = class AccountController {
    db;
    constructor(db) {
        this.db = db;
    }
    async requireUser(req) {
        const user = await this.db.userFromRequest(req);
        if (!user)
            throw err(401, "Login required");
        return user;
    }
    // ---- Shortlist ----
    async shortlist(req) {
        const user = await this.requireUser(req);
        const { rows } = await this.db.q("SELECT property_id FROM shortlist WHERE email = $1", [user.email]);
        return { ids: rows.map(r => r.property_id) };
    }
    async toggle(body, req) {
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
    async book(body, req) {
        const user = await this.requireUser(req);
        const { rows: [prop] } = await this.db.q("SELECT * FROM properties WHERE id = $1", [body.property_id]);
        if (!prop)
            throw err(404, "Property not found");
        const bid = this.db.uid("visit");
        // Free mode: confirm the booking immediately, no invoice/payment.
        if (VISIT_FEE_INR <= 0) {
            await this.db.q("INSERT INTO bookings (id,email,property_id,date_pref,status) VALUES ($1,$2,$3,$4,'confirmed')", [bid, user.email, prop.id, body.date_pref || ""]);
            this.db.sendEmail(user.email, "Visit confirmed — " + prop.title, `Hi ${user.name}, your site visit for ${prop.title} (${prop.area}, ${prop.city}) is confirmed. Our advisor will call to finalise the time.`);
            return { booking_id: bid, amount: 0, free: true };
        }
        // Paid mode: booking awaits a refundable-token payment.
        await this.db.q("INSERT INTO bookings (id,email,property_id,date_pref,status) VALUES ($1,$2,$3,$4,'awaiting_payment')", [bid, user.email, prop.id, body.date_pref || ""]);
        const iid = this.db.uid("inv");
        await this.db.q("INSERT INTO invoices (id,email,booking_id,description,amount) VALUES ($1,$2,$3,$4,$5)", [iid, user.email, bid, `Site-visit token — ${prop.title} (${prop.area}, ${prop.city})`, VISIT_FEE_INR]);
        this.db.sendEmail(user.email, "Visit request received — " + prop.title, `Hi ${user.name}, your site-visit request for ${prop.title} is in. Pay the refundable token of ₹${VISIT_FEE_INR} to confirm your slot.`);
        return { booking_id: bid, invoice_id: iid, amount: VISIT_FEE_INR };
    }
    async bookings(req) {
        const user = await this.requireUser(req);
        const { rows } = await this.db.q(`
      SELECT b.*, p.title, p.area, p.city, p.img FROM bookings b
      LEFT JOIN properties p ON p.id = b.property_id
      WHERE b.email = $1 ORDER BY b.created_at DESC`, [user.email]);
        return { bookings: rows };
    }
    async invoices(req) {
        const user = await this.requireUser(req);
        const { rows } = await this.db.q("SELECT * FROM invoices WHERE email = $1 ORDER BY created_at DESC", [user.email]);
        return { invoices: rows };
    }
    // Mock payment capture. PRODUCTION: create a Razorpay order here, verify the
    // gateway signature in a webhook, and only then mark the invoice paid.
    async pay(body, req) {
        const user = await this.requireUser(req);
        const { rows: [inv] } = await this.db.q("SELECT * FROM invoices WHERE id = $1 AND email = $2", [body.invoice_id, user.email]);
        if (!inv)
            throw err(404, "Invoice not found");
        if (inv.status === "paid")
            throw err(400, "Already paid");
        const ref = "pay_" + crypto.randomBytes(8).toString("hex");
        await this.db.q("UPDATE invoices SET status='paid', method=$1, gateway_ref=$2, paid_at=now() WHERE id=$3", [body.method || "card", ref, inv.id]);
        if (inv.booking_id)
            await this.db.q("UPDATE bookings SET status='confirmed' WHERE id=$1", [inv.booking_id]);
        this.db.sendEmail(user.email, "Payment received — " + inv.id, `We received ₹${inv.amount} (ref ${ref}). Your site visit is confirmed — our advisor will call to fix the slot.`);
        return { ok: true, gateway_ref: ref };
    }
    // ---- AI chat (Claude API). Set ANTHROPIC_API_KEY to enable; the client
    // falls back to the built-in rule-based search when this returns 501. ----
    async chatAsk(body) {
        const key = process.env.ANTHROPIC_API_KEY;
        if (!key)
            throw err(501, "AI chat not configured — set ANTHROPIC_API_KEY");
        const { rows } = await this.db.q("SELECT id,title,type,category,city,area,pincode,price_inr,beds,baths,sqft,furnishing FROM properties ORDER BY created_at DESC LIMIT 60");
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
        if (!resp.ok)
            throw err(502, "AI service unavailable");
        const data = await resp.json();
        const text = data.content?.[0]?.text || "";
        const ids = (text.match(/PROPS:([\w,-]+)/)?.[1] || "").split(",").filter(Boolean);
        return { reply: text.replace(/PROPS:[\w,-]+/g, "").trim(), propertyIds: ids };
    }
    // ---- Chatbot conversation log ----
    async chatLog(body) {
        if (!body.session || !body.who || !body.text)
            throw err(400, "session, who, text required");
        await this.db.q("INSERT INTO chat_messages (session, who, text) VALUES ($1,$2,$3)", [String(body.session).slice(0, 64), body.who === "me" ? "user" : "bot", String(body.text).slice(0, 2000)]);
        return { ok: true };
    }
    async chatHistory(session) {
        if (!session)
            throw err(400, "session required");
        const { rows } = await this.db.q("SELECT who, text, created_at FROM chat_messages WHERE session = $1 ORDER BY id ASC LIMIT 200", [session]);
        return { messages: rows };
    }
};
exports.AccountController = AccountController;
__decorate([
    (0, common_1.Get)("shortlist"),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AccountController.prototype, "shortlist", null);
__decorate([
    (0, common_1.Post)("shortlist"),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AccountController.prototype, "toggle", null);
__decorate([
    (0, common_1.Post)("bookings"),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AccountController.prototype, "book", null);
__decorate([
    (0, common_1.Get)("bookings"),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AccountController.prototype, "bookings", null);
__decorate([
    (0, common_1.Get)("invoices"),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AccountController.prototype, "invoices", null);
__decorate([
    (0, common_1.Post)("payments/pay"),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AccountController.prototype, "pay", null);
__decorate([
    (0, common_1.Post)("chat/ask"),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AccountController.prototype, "chatAsk", null);
__decorate([
    (0, common_1.Post)("chat/log"),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AccountController.prototype, "chatLog", null);
__decorate([
    (0, common_1.Get)("chat/history"),
    __param(0, (0, common_1.Query)("session")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AccountController.prototype, "chatHistory", null);
exports.AccountController = AccountController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [db_service_1.DbService])
], AccountController);
