# FNS Realty

Full-stack real estate site — Find, Negotiate, Settle. Buy/Rent, Resale/New Projects, owner & realtor listings, chat assistant, WhatsApp, email OTP verification, site-visit booking with online payment.

## Run

```bash
node server.js        # needs Node 23+ (uses built-in node:sqlite)
# open http://localhost:4173
```

The SQLite database (`fns.db`) is created and seeded with 9 demo listings on first run. Delete the file to reset everything.

## Stack

- **Backend:** `server.js` — zero-dependency Node (node:http + node:sqlite). REST API + static file serving.
- **Frontend:** vanilla HTML/CSS/JS. `js/api.js` (API client + session), `js/app.js` (UI chrome, chatbot, checkout modal).
- **Auth:** scrypt-hashed passwords, email OTP verification (6-digit, 10-min expiry), bearer session tokens.
- **Payments:** invoices + mock gateway capture (UPI/Card/NetBanking UI). Bookings auto-confirm on payment.

## Demo mode → production

| Feature | Demo behavior | Production swap |
|---|---|---|
| OTP email | Logged to server console and returned to the UI (`demo_otp`) | Implement `sendEmail()` in `server.js` with nodemailer/SES/Resend + SMTP creds; set `SMTP_HOST` env var to disable demo OTP exposure |
| Payments | `/api/payments/pay` marks the invoice paid instantly | Create a Razorpay/Stripe order server-side, collect via their SDK, verify the webhook signature before marking paid |
| WhatsApp / phone | Placeholder number in `js/app.js` (`FNS.whatsapp`) | Replace with the business number |
| Listing photos | Stored as data-URLs in SQLite (fine for demo) | Move to S3/Cloudinary and store URLs |

## API

`POST /api/auth/signup · verify · resend · login · logout` — `GET /api/me`
`GET/POST /api/properties` · `GET/DELETE /api/properties/:id`
`GET/POST /api/shortlist` (POST toggles)
`GET/POST /api/bookings` — booking creates a ₹999 site-visit-token invoice
`GET /api/invoices` — `POST /api/payments/pay`

All mutating routes require `Authorization: Bearer <token>`; posting a property requires a verified email.
