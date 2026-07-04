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
Object.defineProperty(exports, "__esModule", { value: true });
exports.DbService = void 0;
// Data layer. DATABASE_URL points at local Postgres by default — swap it for
// your Supabase project's connection string (Settings → Database) to go hosted.
const common_1 = require("@nestjs/common");
const pg_1 = require("pg");
const crypto = __importStar(require("node:crypto"));
let DbService = class DbService {
    pool = new pg_1.Pool({
        connectionString: process.env.DATABASE_URL || "postgresql://localhost:5433/nestora",
        // Supabase requires SSL; local Postgres doesn't.
        ssl: process.env.DATABASE_URL?.includes("supabase") ? { rejectUnauthorized: false } : undefined
    });
    q(text, params) { return this.pool.query(text, params); }
    async onModuleInit() {
        await this.q(`
      CREATE TABLE IF NOT EXISTS users (
        email TEXT PRIMARY KEY, name TEXT, password TEXT, role TEXT,
        verified BOOLEAN DEFAULT FALSE, otp TEXT, otp_expires BIGINT, created_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, email TEXT, created_at TIMESTAMPTZ DEFAULT now());
      CREATE TABLE IF NOT EXISTS properties (
        id TEXT PRIMARY KEY, title TEXT, type TEXT, category TEXT,
        city TEXT, area TEXT, pincode TEXT, price_inr BIGINT,
        beds INT, baths INT, sqft INT, description TEXT,
        img TEXT, photos JSONB DEFAULT '[]', video TEXT,
        posted_by TEXT, role TEXT, lat DOUBLE PRECISION, lng DOUBLE PRECISION,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS shortlist (email TEXT, property_id TEXT, PRIMARY KEY (email, property_id));
      CREATE TABLE IF NOT EXISTS bookings (
        id TEXT PRIMARY KEY, email TEXT, property_id TEXT, date_pref TEXT,
        status TEXT DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS invoices (
        id TEXT PRIMARY KEY, email TEXT, booking_id TEXT, description TEXT,
        amount INT, status TEXT DEFAULT 'unpaid', method TEXT, gateway_ref TEXT,
        created_at TIMESTAMPTZ DEFAULT now(), paid_at TIMESTAMPTZ
      );
      CREATE TABLE IF NOT EXISTS chat_messages (
        id BIGSERIAL PRIMARY KEY, session TEXT, who TEXT, text TEXT, created_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_chat_session ON chat_messages (session, id);
    `);
        await this.seed();
    }
    async seed() {
        const { rows: [{ c }] } = await this.q("SELECT COUNT(*)::int AS c FROM properties");
        if (c > 0)
            return;
        const seeds = [
            ["nst-101", "3 BHK Lake-View Apartment", "buy", "new", "Bengaluru", "Whitefield", "560066", 12500000, 3, 3, 1650, "Spacious 3 BHK in a gated community with clubhouse, pool and 24x7 security. East-facing with an uninterrupted lake view.", 12.9698, 77.7500],
            ["nst-102", "Sea-Facing 2 BHK Flat", "buy", "resale", "Mumbai", "Bandra West", "400050", 34000000, 2, 2, 980, "Well-maintained 2 BHK on the 14th floor with sea view, covered parking and premium fittings. Walk to the promenade.", 19.0596, 72.8295],
            ["nst-103", "Modern 1 BHK Studio", "rent", "new", "Pune", "Hinjewadi", "411057", 24000, 1, 1, 620, "Fully furnished studio close to the IT park. Ideal for working professionals. Includes gym and co-working lounge.", 18.5913, 73.7389],
            ["nst-104", "Independent Villa with Garden", "buy", "new", "Hyderabad", "Gachibowli", "500032", 28500000, 4, 4, 3200, "Luxury 4 BHK villa with private garden, home theatre and solar backup in a premium enclave near the financial district.", 17.4401, 78.3489],
            ["nst-105", "Cozy 2 BHK for Rent", "rent", "resale", "Bengaluru", "Koramangala", "560095", 42000, 2, 2, 1100, "Semi-furnished 2 BHK in the heart of Koramangala with easy access to cafes, offices and metro connectivity.", 12.9352, 77.6245],
            ["nst-106", "Premium 3 BHK Penthouse", "buy", "resale", "Delhi", "Dwarka", "110075", 21000000, 3, 3, 2100, "Top-floor penthouse with private terrace, modular kitchen and two covered parking spots. Metro just 5 minutes away.", 28.5921, 77.0460],
            ["nst-107", "Affordable 1 BHK Apartment", "buy", "new", "Pune", "Wakad", "411057", 5800000, 1, 1, 640, "Budget-friendly 1 BHK in a new project with amenities like children's play area, jogging track and power backup.", 18.5975, 73.7898],
            ["nst-108", "Spacious 4 BHK for Rent", "rent", "new", "Hyderabad", "Kondapur", "500084", 65000, 4, 4, 2400, "Large family home with servant room, two balconies and dedicated parking. Close to top international schools.", 17.4649, 78.3629],
            ["nst-109", "Riverside 2 BHK Flat", "buy", "new", "Ahmedabad", "Vastrapur", "380015", 8900000, 2, 2, 1250, "Bright 2 BHK overlooking the lake, with vaastu-compliant layout, clubhouse and landscaped gardens.", 23.0396, 72.5290],
            ["nst-110", "2 BHK near Adyar Signal", "buy", "resale", "Chennai", "Adyar", "600020", 11500000, 2, 2, 1050, "Bright corner-unit 2 BHK a short walk from Adyar's restaurant strip, parks and the beach road. Covered parking included.", 13.0067, 80.2570],
            ["nst-111", "3 BHK Garden Apartment", "rent", "new", "Chennai", "Besant Nagar", "600090", 55000, 3, 3, 1500, "Airy 3 BHK near Elliot's Beach with gym, play area and two balconies. Ideal family neighbourhood.", 13.0002, 80.2668],
            ["nst-112", "Compact 1 BHK in Indiranagar", "rent", "resale", "Bengaluru", "Indiranagar", "560038", 30000, 1, 1, 700, "Fully furnished 1 BHK just off 100 Feet Road — cafes, breweries and the metro at your doorstep.", 12.9719, 77.6412]
        ];
        for (const s of seeds) {
            await this.q(`INSERT INTO properties (id,title,type,category,city,area,pincode,price_inr,beds,baths,sqft,description,lat,lng,img,posted_by,role)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'seed','seed')`, [...s, `https://picsum.photos/seed/${String(s[0]).replace("-", "")}/800/500`]);
        }
        console.log("Seeded", seeds.length, "properties");
    }
    // ---- auth helpers ----
    uid(prefix) { return prefix + "-" + crypto.randomBytes(6).toString("hex"); }
    hashPassword(pw) {
        const salt = crypto.randomBytes(12).toString("hex");
        return salt + ":" + crypto.scryptSync(pw, salt, 32).toString("hex");
    }
    checkPassword(pw, stored) {
        const [salt, hash] = (stored || "").split(":");
        if (!salt || !hash)
            return false;
        return crypto.timingSafeEqual(Buffer.from(hash, "hex"), crypto.scryptSync(pw, salt, 32));
    }
    async userFromRequest(req) {
        const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
        if (!token)
            return null;
        const { rows } = await this.q("SELECT u.* FROM sessions s JOIN users u ON u.email = s.email WHERE s.token = $1", [token]);
        return rows[0] || null;
    }
    async createSession(email) {
        const token = crypto.randomBytes(24).toString("hex");
        await this.q("INSERT INTO sessions (token,email) VALUES ($1,$2)", [token, email]);
        return token;
    }
    // DEMO email transport: logs the OTP. Swap for nodemailer/SES/Resend (or
    // Supabase Auth's built-in OTP emails once you connect a Supabase project).
    demoMode = !process.env.SMTP_HOST;
    sendEmail(to, subject, text) {
        console.log(`\n=== EMAIL to ${to} ===\n${subject}\n${text}\n====================\n`);
    }
    async issueOtp(email) {
        const otp = "" + crypto.randomInt(100000, 1000000);
        await this.q("UPDATE users SET otp = $1, otp_expires = $2 WHERE email = $3", [otp, Date.now() + 10 * 60 * 1000, email]);
        this.sendEmail(email, "Your Nestora verification code", `Your OTP is ${otp}. It expires in 10 minutes.`);
        return otp;
    }
    publicUser(u) { return { name: u.name, email: u.email, role: u.role, verified: !!u.verified }; }
    toApiProp(row) {
        const { price_inr, description, posted_by, created_at, ...rest } = row;
        return { ...rest, priceINR: Number(price_inr), desc: description, postedBy: posted_by, createdAt: created_at };
    }
};
exports.DbService = DbService;
exports.DbService = DbService = __decorate([
    (0, common_1.Injectable)()
], DbService);
