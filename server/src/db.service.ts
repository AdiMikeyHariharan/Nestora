// Data layer. DATABASE_URL points at local Postgres by default — swap it for
// your Supabase project's connection string (Settings → Database) to go hosted.
import { Injectable, OnModuleInit } from "@nestjs/common";
import { Pool } from "pg";
import * as crypto from "node:crypto";
import { Resend } from "resend";

@Injectable()
export class DbService implements OnModuleInit {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL || "postgresql://localhost:5433/nestora",
    // Hosted Postgres (Supabase, Neon, etc) require SSL; local doesn't.
    ssl: (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("localhost")) ? { rejectUnauthorized: false } : undefined
  });

  q(text: string, params?: any[]) { return this.pool.query(text, params); }

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
        beds REAL, baths INT, sqft INT, description TEXT,
        img TEXT, photos JSONB DEFAULT '[]', video TEXT,
        posted_by TEXT, role TEXT, lat DOUBLE PRECISION, lng DOUBLE PRECISION,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      ALTER TABLE properties ADD COLUMN IF NOT EXISTS furnishing TEXT DEFAULT 'unfurnished';
      DO $$ BEGIN
        IF (SELECT data_type FROM information_schema.columns WHERE table_name='properties' AND column_name='beds') = 'integer' THEN
          ALTER TABLE properties ALTER COLUMN beds TYPE REAL;
        END IF;
      END $$;
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

  private async seed() {
    const { rows: [{ c }] } = await this.q("SELECT COUNT(*)::int AS c FROM properties");
    if (c > 0) return;
    const seeds: any[][] = [
      ["nst-101","3 BHK Lake-View Apartment","buy","new","Bengaluru","Whitefield","560066",12500000,3,3,1650,"Spacious 3 BHK in a gated community with clubhouse, pool and 24x7 security. East-facing with an uninterrupted lake view.",12.9698,77.7500],
      ["nst-102","Sea-Facing 2 BHK Flat","buy","resale","Mumbai","Bandra West","400050",34000000,2,2,980,"Well-maintained 2 BHK on the 14th floor with sea view, covered parking and premium fittings. Walk to the promenade.",19.0596,72.8295],
      ["nst-103","Modern 1 BHK Studio","rent","new","Pune","Hinjewadi","411057",24000,1,1,620,"Fully furnished studio close to the IT park. Ideal for working professionals. Includes gym and co-working lounge.",18.5913,73.7389],
      ["nst-104","Independent Villa with Garden","buy","new","Hyderabad","Gachibowli","500032",28500000,4,4,3200,"Luxury 4 BHK villa with private garden, home theatre and solar backup in a premium enclave near the financial district.",17.4401,78.3489],
      ["nst-105","Cozy 2 BHK for Rent","rent","resale","Bengaluru","Koramangala","560095",42000,2,2,1100,"Semi-furnished 2 BHK in the heart of Koramangala with easy access to cafes, offices and metro connectivity.",12.9352,77.6245],
      ["nst-106","Premium 3 BHK Penthouse","buy","resale","Delhi","Dwarka","110075",21000000,3,3,2100,"Top-floor penthouse with private terrace, modular kitchen and two covered parking spots. Metro just 5 minutes away.",28.5921,77.0460],
      ["nst-107","Affordable 1 BHK Apartment","buy","new","Pune","Wakad","411057",5800000,1,1,640,"Budget-friendly 1 BHK in a new project with amenities like children's play area, jogging track and power backup.",18.5975,73.7898],
      ["nst-108","Spacious 4 BHK for Rent","rent","new","Hyderabad","Kondapur","500084",65000,4,4,2400,"Large family home with servant room, two balconies and dedicated parking. Close to top international schools.",17.4649,78.3629],
      ["nst-109","Riverside 2 BHK Flat","buy","new","Ahmedabad","Vastrapur","380015",8900000,2,2,1250,"Bright 2 BHK overlooking the lake, with vaastu-compliant layout, clubhouse and landscaped gardens.",23.0396,72.5290],
      ["nst-110","2 BHK near Adyar Signal","buy","resale","Chennai","Adyar","600020",11500000,2,2,1050,"Bright corner-unit 2 BHK a short walk from Adyar's restaurant strip, parks and the beach road. Covered parking included.",13.0067,80.2570],
      ["nst-111","3 BHK Garden Apartment","rent","new","Chennai","Besant Nagar","600090",55000,3,3,1500,"Airy 3 BHK near Elliot's Beach with gym, play area and two balconies. Ideal family neighbourhood.",13.0002,80.2668],
      ["nst-112","Compact 1 BHK in Indiranagar","rent","resale","Bengaluru","Indiranagar","560038",30000,1,1,700,"Fully furnished 1 BHK just off 100 Feet Road — cafes, breweries and the metro at your doorstep.",12.9719,77.6412],
      ["nst-113","1.5 BHK with Study Nook","rent","new","Pune","Baner","411045",34000,1.5,1,780,"Smart 1.5 BHK with a dedicated study/WFH nook, ideal for professionals. Gym, cafe and IT parks minutes away.",18.5590,73.7868],
      ["nst-114","2.5 BHK Corner Residence","buy","new","Bengaluru","Hebbal","560024",16800000,2.5,3,1480,"Spacious 2.5 BHK corner unit — the half room works as a nursery, study or guest space. Lake and airport road nearby.",13.0358,77.5970]
    ];
    const photos: Record<string, string> = {
      "nst-101": "1600596542815-ffad4c1539a9", "nst-102": "1512917774080-9991f1c4c750",
      "nst-103": "1522708323590-d24dbb6b0267", "nst-104": "1580587771525-78b9dba3b914",
      "nst-105": "1493809842364-78817add7ffb", "nst-106": "1600607687939-ce8a6c25118c",
      "nst-107": "1560448204-e02f11c3d0e2", "nst-108": "1600585154340-be6161a56a0c",
      "nst-109": "1600047509807-ba8f99d2cdde", "nst-110": "1600566753190-17f0baa2a6c3",
      "nst-111": "1600210492486-724fe5c67fb0", "nst-112": "1570129477492-45c003edd2be"
    };
    for (const s of seeds) {
      await this.q(`INSERT INTO properties (id,title,type,category,city,area,pincode,price_inr,beds,baths,sqft,description,lat,lng,img,posted_by,role)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'seed','seed')`,
        [...s, `https://images.unsplash.com/photo-${photos[String(s[0])]}?auto=format&fit=crop&w=800&q=70`]);
    }
    console.log("Seeded", seeds.length, "properties");
  }

  // ---- auth helpers ----
  uid(prefix: string) { return prefix + "-" + crypto.randomBytes(6).toString("hex"); }

  hashPassword(pw: string) {
    const salt = crypto.randomBytes(12).toString("hex");
    return salt + ":" + crypto.scryptSync(pw, salt, 32).toString("hex");
  }
  checkPassword(pw: string, stored: string) {
    const [salt, hash] = (stored || "").split(":");
    if (!salt || !hash) return false;
    return crypto.timingSafeEqual(Buffer.from(hash, "hex"), crypto.scryptSync(pw, salt, 32));
  }

  async userFromRequest(req: any) {
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!token) return null;
    const { rows } = await this.q(
      "SELECT u.* FROM sessions s JOIN users u ON u.email = s.email WHERE s.token = $1", [token]);
    return rows[0] || null;
  }

  async createSession(email: string) {
    const token = crypto.randomBytes(24).toString("hex");
    await this.q("INSERT INTO sessions (token,email) VALUES ($1,$2)", [token, email]);
    return token;
  }

  // Only initialise Resend when a key is present; otherwise email falls back to
  // console logging so the server still runs (local dev / unconfigured envs).
  resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

  async sendEmail(to: string, subject: string, text: string) {
    console.log(`\n=== EMAIL to ${to} ===\n${subject}\n${text}\n====================\n`);
    if (!this.resend) return;

    try {
      await this.resend.emails.send({
        from: "Nestora <noreply@nestora.properties>",
        to: to,
        replyTo: "support@nestora.properties",
        subject: subject,
        html: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; line-height: 1.6; border: 1px solid #e2e8f0; border-radius: 12px;">
          <div style="background-color: #059669; padding: 15px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 800;">Nestora</h1>
          </div>
          <div style="padding: 20px; color: #1e293b;">
            <p style="margin-top: 0; font-size: 16px;">${text.replace(/\n/g, "<br>")}</p>
          </div>
          <div style="border-top: 1px solid #e2e8f0; padding-top: 15px; text-align: center; font-size: 12px; color: #64748b;">
            Nestora properties · Find your nest
          </div>
        </div>`
      });
    } catch (err) {
      console.error("Failed to send email via Resend SDK:", err);
    }
  }

  async issueOtp(email: string) {
    const otp = "" + crypto.randomInt(100000, 1000000);
    await this.q("UPDATE users SET otp = $1, otp_expires = $2 WHERE email = $3",
      [otp, Date.now() + 10 * 60 * 1000, email]);
    this.sendEmail(email, "Your Nestora verification code", `Your OTP is ${otp}. It expires in 10 minutes.`);
    return otp;
  }

  publicUser(u: any) { return { name: u.name, email: u.email, role: u.role, verified: !!u.verified }; }

  toApiProp(row: any) {
    const { price_inr, description, posted_by, created_at, ...rest } = row;
    return { ...rest, priceINR: Number(price_inr), desc: description, postedBy: posted_by, createdAt: created_at };
  }
}
