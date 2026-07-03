// Nestora backend — Node + PostgreSQL.
// Auth (signup + email OTP verification + login), properties with geospatial
// search (haversine + OSM Nominatim geocoding), shortlist, bookings, invoices
// and a mock payment gateway. Serves the built React client from client/dist.
//
// PRODUCTION SWAP POINTS:
//  - sendEmail(): plug in nodemailer/SES/Resend with real SMTP creds.
//  - /api/payments/pay: replace mock capture with Razorpay/Stripe order + webhook.

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { Pool } = require("pg");

const PORT = process.env.PORT || 4173;
const ROOT = __dirname;
const DIST = path.join(ROOT, "client", "dist");
const VISIT_FEE_INR = 999; // refundable site-visit token amount

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://localhost:5433/nestora"
});
const q = (text, params) => pool.query(text, params);

// ---------- Schema + seed ----------
async function initDb() {
  await q(`
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
  `);

  const { rows: [{ c }] } = await q("SELECT COUNT(*)::int AS c FROM properties");
  if (c === 0) {
    const seeds = [
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
      ["nst-112","Compact 1 BHK in Indiranagar","rent","resale","Bengaluru","Indiranagar","560038",30000,1,1,700,"Fully furnished 1 BHK just off 100 Feet Road — cafes, breweries and the metro at your doorstep.",12.9719,77.6412]
    ];
    for (const s of seeds) {
      await q(`INSERT INTO properties (id,title,type,category,city,area,pincode,price_inr,beds,baths,sqft,description,lat,lng,img,posted_by,role)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'seed','seed')`,
        [...s, `https://picsum.photos/seed/${s[0].replace("-", "")}/800/500`]);
    }
    console.log("Seeded", seeds.length, "properties");
  }
}

// ---------- Helpers ----------
const uid = p => p + "-" + crypto.randomBytes(6).toString("hex");

function hashPassword(pw) {
  const salt = crypto.randomBytes(12).toString("hex");
  return salt + ":" + crypto.scryptSync(pw, salt, 32).toString("hex");
}
function checkPassword(pw, stored) {
  const [salt, hash] = (stored || "").split(":");
  if (!salt || !hash) return false;
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), crypto.scryptSync(pw, salt, 32));
}

// DEMO email transport: logs the OTP. Swap this body for nodemailer/SES/Resend.
const DEMO_MODE = !process.env.SMTP_HOST;
function sendEmail(to, subject, text) {
  console.log(`\n=== EMAIL to ${to} ===\n${subject}\n${text}\n====================\n`);
}

function publicUser(u) { return { name: u.name, email: u.email, role: u.role, verified: !!u.verified }; }

// API JSON uses camelCase price + desc for the client
function toApiProp(row) {
  const { price_inr, description, posted_by, created_at, ...rest } = row;
  return { ...rest, priceINR: Number(price_inr), desc: description, postedBy: posted_by, createdAt: created_at };
}

// Haversine distance in km
function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371, toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Geocoding: OSM Nominatim (precise) with Photon fallback (fuzzy, good for
// POI names like restaurants). In-memory cached. Keep the UA header — OSM policy.
const geoCache = new Map();
async function geocode(text) {
  const key = text.trim().toLowerCase();
  if (geoCache.has(key)) return geoCache.get(key);

  let results = [];
  try {
    const url = "https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=in&q=" + encodeURIComponent(text);
    const resp = await fetch(url, { headers: { "User-Agent": "NestoraDemo/1.0 (demo real-estate site)" } });
    if (resp.ok) {
      results = (await resp.json()).map(r => ({
        name: r.display_name.split(",").slice(0, 3).join(",").trim(),
        full: r.display_name, lat: parseFloat(r.lat), lng: parseFloat(r.lon), kind: r.type
      }));
    }
  } catch (e) { /* fall through to Photon */ }

  if (!results.length) {
    // Photon: fuzzy prefix search, bounded to India
    const url = "https://photon.komoot.io/api/?limit=5&lang=en&bbox=68,6,98,36&q=" + encodeURIComponent(text);
    const resp = await fetch(url, { headers: { "User-Agent": "NestoraDemo/1.0" } });
    if (!resp.ok) throw new Error("Geocoder unavailable");
    const data = await resp.json();
    results = (data.features || []).map(f => {
      const pr = f.properties;
      const label = [pr.name, pr.city || pr.district, pr.state].filter(Boolean).join(", ");
      return {
        name: label, full: label + (pr.country ? ", " + pr.country : ""),
        lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], kind: pr.osm_value || "place"
      };
    });
  }
  geoCache.set(key, results);
  return results;
}

async function getAuthUser(req) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { rows } = await q("SELECT u.* FROM sessions s JOIN users u ON u.email = s.email WHERE s.token = $1", [token]);
  return rows[0] || null;
}

async function issueOtp(email) {
  const otp = "" + crypto.randomInt(100000, 1000000);
  await q("UPDATE users SET otp = $1, otp_expires = $2 WHERE email = $3", [otp, Date.now() + 10 * 60 * 1000, email]);
  sendEmail(email, "Your Nestora verification code", `Your OTP is ${otp}. It expires in 10 minutes.`);
  return otp;
}

function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "", size = 0;
    req.on("data", c => {
      size += c.length;
      if (size > 30 * 1024 * 1024) { reject(new Error("payload too large")); req.destroy(); return; }
      data += c;
    });
    req.on("end", () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on("error", reject);
  });
}

// ---------- API routes ----------
async function handleApi(req, res, url) {
  const seg = url.pathname.split("/").filter(Boolean); // ["api", ...]
  const route = req.method + " /" + seg.slice(0, 3).join("/");
  const body = ["POST", "PUT", "DELETE"].includes(req.method) ? await readBody(req).catch(() => null) : {};
  if (body === null) return send(res, 400, { error: "Bad request body" });
  const user = await getAuthUser(req);

  // ---- Auth ----
  if (route === "POST /api/auth/signup") {
    const { name, email, password, role } = body;
    if (!name || !email || !password || password.length < 6) return send(res, 400, { error: "Name, email and a 6+ char password are required" });
    const em = email.trim().toLowerCase();
    const { rows } = await q("SELECT 1 FROM users WHERE email = $1", [em]);
    if (rows.length) return send(res, 409, { error: "Account exists — please login" });
    await q("INSERT INTO users (email,name,password,role) VALUES ($1,$2,$3,$4)", [em, name.trim(), hashPassword(password), role || "buyer"]);
    const otp = await issueOtp(em);
    return send(res, 200, { needsOtp: true, email: em, ...(DEMO_MODE ? { demo_otp: otp } : {}) });
  }

  if (route === "POST /api/auth/verify") {
    const em = (body.email || "").trim().toLowerCase();
    const { rows: [u] } = await q("SELECT * FROM users WHERE email = $1", [em]);
    if (!u) return send(res, 404, { error: "No such account" });
    if (!u.otp || u.otp !== body.otp) return send(res, 400, { error: "Incorrect OTP" });
    if (Date.now() > Number(u.otp_expires)) return send(res, 400, { error: "OTP expired — resend a new one" });
    await q("UPDATE users SET verified = TRUE, otp = NULL WHERE email = $1", [em]);
    const token = crypto.randomBytes(24).toString("hex");
    await q("INSERT INTO sessions (token,email) VALUES ($1,$2)", [token, em]);
    return send(res, 200, { token, user: publicUser({ ...u, verified: true }) });
  }

  if (route === "POST /api/auth/resend") {
    const em = (body.email || "").trim().toLowerCase();
    const { rows } = await q("SELECT 1 FROM users WHERE email = $1", [em]);
    if (!rows.length) return send(res, 404, { error: "No such account" });
    const otp = await issueOtp(em);
    return send(res, 200, { ok: true, ...(DEMO_MODE ? { demo_otp: otp } : {}) });
  }

  if (route === "POST /api/auth/login") {
    const em = (body.email || "").trim().toLowerCase();
    const { rows: [u] } = await q("SELECT * FROM users WHERE email = $1", [em]);
    if (!u || !checkPassword(body.password || "", u.password)) return send(res, 401, { error: "Invalid email or password" });
    if (!u.verified) {
      const otp = await issueOtp(em);
      return send(res, 200, { needsOtp: true, email: em, ...(DEMO_MODE ? { demo_otp: otp } : {}) });
    }
    const token = crypto.randomBytes(24).toString("hex");
    await q("INSERT INTO sessions (token,email) VALUES ($1,$2)", [token, em]);
    return send(res, 200, { token, user: publicUser(u) });
  }

  if (route === "GET /api/me") {
    if (!user) return send(res, 401, { error: "Not logged in" });
    return send(res, 200, { user: publicUser(user) });
  }

  if (route === "POST /api/auth/logout") {
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    await q("DELETE FROM sessions WHERE token = $1", [token]);
    return send(res, 200, { ok: true });
  }

  // ---- Geocoding ----
  if (route === "GET /api/geocode") {
    const text = url.searchParams.get("q");
    if (!text) return send(res, 400, { error: "q required" });
    try { return send(res, 200, { results: await geocode(text) }); }
    catch (e) { return send(res, 502, { error: "Geocoder unavailable — try again" }); }
  }

  // ---- Properties (with geospatial search) ----
  if (route === "GET /api/properties" && seg.length === 2) {
    const p = url.searchParams;
    const where = [], params = [];
    const add = (sql, val) => { params.push(val); where.push(sql.replace("?", "$" + params.length)); };
    if (p.get("q")) add("(city || ' ' || area) ILIKE ?", "%" + p.get("q") + "%");
    if (p.get("pincode")) add("pincode LIKE ?", p.get("pincode") + "%");
    if (p.get("type")) add("type = ?", p.get("type"));
    if (p.get("category")) add("category = ?", p.get("category"));
    if (p.get("budget")) add("price_inr <= ?", parseInt(p.get("budget"), 10));
    if (p.get("beds")) add("beds = ?", parseInt(p.get("beds"), 10));
    const { rows } = await q(
      `SELECT * FROM properties ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY created_at DESC`, params);
    let list = rows.map(toApiProp);

    // near=<lat>,<lng>&radius=<km> → haversine filter + distance sort
    const near = (p.get("near") || "").split(",").map(Number);
    if (near.length === 2 && !near.some(isNaN)) {
      const radius = parseFloat(p.get("radius") || "10");
      list = list
        .filter(x => x.lat != null && x.lng != null)
        .map(x => ({ ...x, distance_km: +distanceKm(near[0], near[1], x.lat, x.lng).toFixed(1) }))
        .filter(x => x.distance_km <= radius)
        .sort((a, b) => a.distance_km - b.distance_km);
    }
    return send(res, 200, { properties: list });
  }

  if (req.method === "GET" && seg[1] === "properties" && seg[2]) {
    const { rows: [row] } = await q("SELECT * FROM properties WHERE id = $1", [seg[2]]);
    if (!row) return send(res, 404, { error: "Not found" });
    return send(res, 200, { property: toApiProp(row) });
  }

  if (route === "POST /api/properties") {
    if (!user) return send(res, 401, { error: "Login required" });
    if (!user.verified) return send(res, 403, { error: "Verify your email first" });
    const required = ["title", "type", "category", "city", "area", "pincode", "priceINR", "beds", "baths", "sqft", "desc"];
    for (const f of required) if (body[f] === undefined || body[f] === "") return send(res, 400, { error: "Missing field: " + f });
    const id = uid("prop");
    // best-effort geocode of the listing's locality so it appears in geo search
    let lat = body.lat ?? null, lng = body.lng ?? null;
    if (lat == null || lng == null) {
      try {
        const g = await geocode(`${body.area}, ${body.city}, India`);
        if (g[0]) { lat = g[0].lat; lng = g[0].lng; }
      } catch (e) { /* listing still saved without coords */ }
    }
    await q(`INSERT INTO properties (id,title,type,category,city,area,pincode,price_inr,beds,baths,sqft,description,img,photos,video,posted_by,role,lat,lng)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
      [id, body.title, body.type, body.category, body.city, body.area, body.pincode,
        parseInt(body.priceINR, 10), parseInt(body.beds, 10), parseInt(body.baths, 10), parseInt(body.sqft, 10),
        body.desc, body.img || (body.photos && body.photos[0]) || `https://picsum.photos/seed/${id}/800/500`,
        JSON.stringify(body.photos || []), body.video || null, user.email, body.role || user.role, lat, lng]);
    return send(res, 200, { id });
  }

  if (req.method === "DELETE" && seg[1] === "properties" && seg[2]) {
    if (!user) return send(res, 401, { error: "Login required" });
    const { rows: [row] } = await q("SELECT posted_by FROM properties WHERE id = $1", [seg[2]]);
    if (!row) return send(res, 404, { error: "Not found" });
    if (row.posted_by !== user.email) return send(res, 403, { error: "Not your listing" });
    await q("DELETE FROM properties WHERE id = $1", [seg[2]]);
    return send(res, 200, { ok: true });
  }

  // ---- Shortlist ----
  if (route === "GET /api/shortlist") {
    if (!user) return send(res, 401, { error: "Login required" });
    const { rows } = await q("SELECT property_id FROM shortlist WHERE email = $1", [user.email]);
    return send(res, 200, { ids: rows.map(r => r.property_id) });
  }
  if (route === "POST /api/shortlist") {
    if (!user) return send(res, 401, { error: "Login required" });
    const id = body.property_id;
    const { rows } = await q("SELECT 1 FROM shortlist WHERE email = $1 AND property_id = $2", [user.email, id]);
    if (rows.length) { await q("DELETE FROM shortlist WHERE email = $1 AND property_id = $2", [user.email, id]); return send(res, 200, { shortlisted: false }); }
    await q("INSERT INTO shortlist (email, property_id) VALUES ($1,$2)", [user.email, id]);
    return send(res, 200, { shortlisted: true });
  }

  // ---- Bookings + invoices ----
  if (route === "POST /api/bookings") {
    if (!user) return send(res, 401, { error: "Login required" });
    const { rows: [prop] } = await q("SELECT * FROM properties WHERE id = $1", [body.property_id]);
    if (!prop) return send(res, 404, { error: "Property not found" });
    const bid = uid("visit");
    await q("INSERT INTO bookings (id,email,property_id,date_pref,status) VALUES ($1,$2,$3,$4,'awaiting_payment')",
      [bid, user.email, prop.id, body.date_pref || ""]);
    const iid = uid("inv");
    await q("INSERT INTO invoices (id,email,booking_id,description,amount) VALUES ($1,$2,$3,$4,$5)",
      [iid, user.email, bid, `Site-visit token — ${prop.title} (${prop.area}, ${prop.city})`, VISIT_FEE_INR]);
    sendEmail(user.email, "Visit request received — " + prop.title,
      `Hi ${user.name}, your site-visit request for ${prop.title} is in. Pay the refundable token of ₹${VISIT_FEE_INR} to confirm your slot.`);
    return send(res, 200, { booking_id: bid, invoice_id: iid, amount: VISIT_FEE_INR });
  }

  if (route === "GET /api/bookings") {
    if (!user) return send(res, 401, { error: "Login required" });
    const { rows } = await q(`
      SELECT b.*, p.title, p.area, p.city, p.img FROM bookings b
      LEFT JOIN properties p ON p.id = b.property_id
      WHERE b.email = $1 ORDER BY b.created_at DESC`, [user.email]);
    return send(res, 200, { bookings: rows });
  }

  if (route === "GET /api/invoices") {
    if (!user) return send(res, 401, { error: "Login required" });
    const { rows } = await q("SELECT * FROM invoices WHERE email = $1 ORDER BY created_at DESC", [user.email]);
    return send(res, 200, { invoices: rows });
  }

  // Mock payment capture. PRODUCTION: create a Razorpay order here, verify the
  // gateway signature in a webhook, and only then mark the invoice paid.
  if (route === "POST /api/payments/pay") {
    if (!user) return send(res, 401, { error: "Login required" });
    const { rows: [inv] } = await q("SELECT * FROM invoices WHERE id = $1 AND email = $2", [body.invoice_id, user.email]);
    if (!inv) return send(res, 404, { error: "Invoice not found" });
    if (inv.status === "paid") return send(res, 400, { error: "Already paid" });
    const ref = "pay_" + crypto.randomBytes(8).toString("hex");
    await q("UPDATE invoices SET status='paid', method=$1, gateway_ref=$2, paid_at=now() WHERE id=$3", [body.method || "card", ref, inv.id]);
    if (inv.booking_id) await q("UPDATE bookings SET status='confirmed' WHERE id=$1", [inv.booking_id]);
    sendEmail(user.email, "Payment received — " + inv.id,
      `We received ₹${inv.amount} (ref ${ref}). Your site visit is confirmed — our advisor will call to fix the slot.`);
    return send(res, 200, { ok: true, gateway_ref: ref });
  }

  send(res, 404, { error: "Unknown API route" });
}

// ---------- Static files (React build) + SPA fallback ----------
const MIME = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript",
  ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml",
  ".ico": "image/x-icon", ".woff2": "font/woff2", ".map": "application/json" };

function serveStatic(req, res, url) {
  let file = path.normalize(path.join(DIST, decodeURIComponent(url.pathname)));
  if (!file.startsWith(DIST)) { res.writeHead(403); return res.end(); }
  if (url.pathname === "/" || !fs.existsSync(file) || !path.extname(file)) file = path.join(DIST, "index.html");
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { "Content-Type": "text/plain" }); return res.end("Not found — run: cd client && npm run build"); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
}

initDb().then(() => {
  http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    try {
      if (url.pathname.startsWith("/api/")) await handleApi(req, res, url);
      else serveStatic(req, res, url);
    } catch (e) {
      console.error(e);
      send(res, 500, { error: "Server error" });
    }
  }).listen(PORT, () => {
    console.log(`Nestora server on http://localhost:${PORT} (Postgres: ${pool.options.connectionString || "env"})${DEMO_MODE ? "  [demo email mode]" : ""}`);
  });
}).catch(e => { console.error("DB init failed:", e.message); process.exit(1); });
