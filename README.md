# Nestora

Full-stack real estate platform — find your nest. Landmark-based geospatial search, live maps, chat assistant with persisted conversations, email OTP auth, site-visit booking with online payment.

## Stack

- **Frontend**: React 19 + Vite, Tailwind CSS v4, motion (animations), react-leaflet (OpenStreetMap), react-router — in `client/`
- **Backend**: NestJS (TypeScript) — in `server/`
- **Database**: PostgreSQL (**Supabase-compatible** — Supabase is hosted Postgres; point `DATABASE_URL` at your Supabase project's connection string and it just works, SSL included)

## Run

```bash
# 1. Postgres (local dev — skip if using Supabase)
/opt/homebrew/opt/postgresql@16/bin/pg_ctl -D /opt/homebrew/var/postgresql@16 -o "-p 5433" start
# db "nestora" on port 5433 is created already; tables auto-create & seed on boot

# 2. Build client + server
cd client && npm run build && cd ../server && npm run build

# 3. Start (serves API + React app)
node server/dist/main.js        # → http://localhost:4173
```

Dev mode with HMR: `cd client && npm run dev` (proxies /api to :4173).

## Environment

| Var | Default | Notes |
|---|---|---|
| `DATABASE_URL` | `postgresql://localhost:5433/nestora` | Set to your **Supabase** connection string (Project Settings → Database) to go hosted |
| `SMTP_HOST` | unset (demo mode) | When unset, OTPs are logged + shown in the UI. Implement `sendEmail()` in `server/src/db.service.ts` with nodemailer/SES/Resend — or use Supabase Auth's email OTP |
| `PORT` | 4173 | |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | unset | Enables "Continue with Google" SSO. Create an OAuth client in Google Cloud Console with redirect URI `<PUBLIC_URL>/api/auth/google/callback` |
| `PUBLIC_URL` | `http://localhost:4173` | Used for the OAuth redirect URI |

## Features

- **Geospatial search**: "2 BHK near Anandas" — landmark autocomplete (OSM Nominatim + Photon fuzzy fallback), haversine radius search sorted by distance, radius slider, map pins with prices + landmark circle
- **Chat assistant**: parses BHK/budget/buy-rent/landmarks, shows property cards inline; conversations persisted in `chat_messages` (per browser session)
- **Auth**: one-time signup, scrypt-hashed passwords, 6-digit email OTP (10-min expiry), bearer sessions
- **Bookings & payments**: ₹999 refundable site-visit token → invoice → mock checkout (UPI/Card/NetBanking) → booking auto-confirms. Swap the mock in `server/src/account.controller.ts` for Razorpay/Stripe (create order → webhook verify → mark paid)
- **Listings**: post with photos/video; locality auto-geocoded so new listings appear in landmark search
- Shortlist, multi-currency (₹/$/AED/£/€), WhatsApp/email enquiries

## API (all under /api)

`POST auth/signup · verify · resend · login · logout` — `GET me`
`GET properties` (`q, pincode, type, category, budget, beds, near=lat,lng, radius`) · `GET/POST/DELETE properties/:id`
`GET/POST shortlist` · `GET/POST bookings` · `GET invoices` · `POST payments/pay`
`GET geocode?q=` · `POST chat/log` · `GET chat/history?session=`
