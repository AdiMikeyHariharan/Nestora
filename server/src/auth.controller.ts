import { Body, Controller, Get, Post, Query, Req, Res, HttpException } from "@nestjs/common";
import { DbService, GOOGLE_TEMP_PREFIX } from "./db.service";
import { text, email, newPassword, oneOf, optOneOf, optPhone, clip } from "./validate";

const ROLES = ["buyer/seller", "agent"] as const;
import * as crypto from "node:crypto";

const err = (code: number, msg: string) => new HttpException({ error: msg }, code);
const STATE_COOKIE = "nst_oauth_state";
const stateCookie = (value: string, maxAge: number) =>
  `${STATE_COOKIE}=${value}; Max-Age=${maxAge}; Path=/api/auth/google; HttpOnly; SameSite=Lax${PUBLIC_URL.startsWith("https") ? "; Secure" : ""}`;
const MAX_OTP_ATTEMPTS = 5;
const MAX_FAILED_LOGINS = 10;
const PUBLIC_URL = process.env.PUBLIC_URL || "http://localhost:" + (process.env.PORT || 4173);

@Controller("auth")
export class AuthController {
  constructor(private db: DbService) {}

  @Post("signup")
  async signup(@Body() body: any) {
    const name = text(body.name, "Name", { max: 80 });
    const em = email(body.email);
    const password = newPassword(body.password);
    const role = oneOf(body.role, "Role", ROLES);
    const phone = optPhone(body.phone);
    const { rows } = await this.db.q("SELECT 1 FROM users WHERE email = $1", [em]);
    if (rows.length) throw err(409, "Account exists — please login");
    await this.db.q("INSERT INTO users (email,name,password,role,phone) VALUES ($1,$2,$3,$4,$5)",
      [em, name, this.db.hashPassword(password), role, phone]);
    await this.db.issueOtp(em);
    return { needsOtp: true, email: em };
  }

  @Post("verify")
  async verify(@Body() body: any) {
    const em = email(body.email);
    if (typeof body.otp !== "string" && typeof body.otp !== "number") throw err(400, "Enter the 6-digit code");
    const { rows: [u] } = await this.db.q("SELECT * FROM users WHERE email = $1", [em]);
    if (!u) throw err(404, "No such account");
    // 5 wrong guesses burn the code, so a 6-digit OTP can't be brute-forced.
    if (!u.otp || u.otp_attempts >= MAX_OTP_ATTEMPTS) throw err(400, "Too many attempts — request a new code");
    if (Date.now() > Number(u.otp_expires)) throw err(400, "OTP expired — resend a new one");
    const given = Buffer.from(String(body.otp || "")), want = Buffer.from(u.otp);
    if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) {
      await this.db.q("UPDATE users SET otp_attempts = otp_attempts + 1 WHERE email = $1", [em]);
      throw err(400, "Incorrect OTP");
    }
    await this.db.q("UPDATE users SET verified = TRUE, otp = NULL, otp_attempts = 0 WHERE email = $1", [em]);
    const token = await this.db.createSession(em);
    return { token, user: this.db.publicUser({ ...u, verified: true }) };
  }

  @Post("resend")
  async resend(@Body() body: any) {
    const em = email(body.email);
    const { rows } = await this.db.q("SELECT 1 FROM users WHERE email = $1", [em]);
    if (!rows.length) throw err(404, "No such account");
    await this.db.issueOtp(em);
    return { ok: true };
  }

  @Post("login")
  async login(@Body() body: any) {
    const em = email(body.email);
    // A non-text or over-long password simply fails the check (still counts as a failed attempt).
    const password = typeof body.password === "string" && body.password.length <= 128 ? body.password : "";
    const { rows: [u] } = await this.db.q("SELECT * FROM users WHERE email = $1", [em]);
    if (u?.locked_until && new Date(u.locked_until) > new Date())
      throw err(429, "Too many failed attempts — try again in 15 minutes, or sign in with an email code");
    if (!u || !u.password || !this.db.checkPassword(password, u.password)) {
      // Lock the account for 15 minutes after 10 straight failures.
      if (u) await this.db.q(`UPDATE users SET
          failed_logins = CASE WHEN failed_logins + 1 >= ${MAX_FAILED_LOGINS} THEN 0 ELSE failed_logins + 1 END,
          locked_until = CASE WHEN failed_logins + 1 >= ${MAX_FAILED_LOGINS} THEN now() + interval '15 minutes' ELSE locked_until END
        WHERE email = $1`, [em]);
      throw err(401, "Invalid email or password");
    }
    if (u.failed_logins) await this.db.q("UPDATE users SET failed_logins = 0 WHERE email = $1", [em]);
    const token = await this.db.createSession(em);
    return { token, user: this.db.publicUser(u) };
  }

  @Post("login-otp")
  async loginOtp(@Body() body: any) {
    const em = email(body.email);
    const { rows: [u] } = await this.db.q("SELECT * FROM users WHERE email = $1", [em]);
    if (!u) throw err(404, "No account found with this email");
    await this.db.issueOtp(em);
    return { needsOtp: true, email: em };
  }

  // ---- SSO (Google OAuth 2.0 authorization-code flow) ----
  // Needs GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET (Google Cloud Console →
  // OAuth client, redirect URI: <PUBLIC_URL>/api/auth/google/callback).
  @Get("sso/status")
  ssoStatus() {
    return { google: !!process.env.GOOGLE_CLIENT_ID };
  }

  @Get("google")
  googleStart(@Query("s") onPublicHost: string, @Res() res: any) {
    if (!process.env.GOOGLE_CLIENT_ID)
      return res.status(501).json({ error: "Google SSO not configured — set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET" });
    // Hop onto PUBLIC_URL first so the state cookie is set on the same host Google
    // redirects back to (the site may be browsed on www while PUBLIC_URL is the apex).
    if (!onPublicHost) return res.redirect(PUBLIC_URL + "/api/auth/google?s=1");
    // OAuth `state` bound to this browser by an HttpOnly cookie: blocks login CSRF,
    // where an attacker's callback URL would sign the victim into the attacker's account.
    const state = crypto.randomBytes(16).toString("hex");
    res.setHeader("Set-Cookie", stateCookie(state, 600));
    const url = "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      redirect_uri: PUBLIC_URL + "/api/auth/google/callback",
      response_type: "code", scope: "openid email profile", prompt: "select_account", state
    });
    res.redirect(url);
  }

  @Get("google/callback")
  async googleCallback(@Query("code") code: string, @Query("state") state: string, @Req() req: any, @Res() res: any) {
    const expected = (String(req.headers.cookie || "").match(new RegExp(`(?:^|;\\s*)${STATE_COOKIE}=([0-9a-f]{32})`)) || [])[1];
    res.setHeader("Set-Cookie", stateCookie("", 0));
    if (!expected || typeof state !== "string" || state.length !== expected.length ||
        !crypto.timingSafeEqual(Buffer.from(state), Buffer.from(expected)))
      return res.redirect(PUBLIC_URL + "/login?sso_error=" + encodeURIComponent("Google sign-in expired — please try again"));
    try {
      const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code, grant_type: "authorization_code",
          client_id: process.env.GOOGLE_CLIENT_ID || "",
          client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
          redirect_uri: PUBLIC_URL + "/api/auth/google/callback"
        })
      });
      const { access_token } = await tokenResp.json() as any;
      const info: any = await (await fetch("https://www.googleapis.com/oauth2/v2/userinfo",
        { headers: { Authorization: "Bearer " + access_token } })).json();
      if (!info.email) throw new Error("no email from Google");
      // Google can return addresses the account holder never proved they own; signing
      // those in would hand over any existing Nestora account with that email.
      if (info.verified_email !== true)
        return res.redirect(PUBLIC_URL + "/login?sso_error=" + encodeURIComponent("Your Google email isn't verified — verify it with Google or sign up with email"));
      const em = info.email.toLowerCase();
      
      // Check if user already exists
      const { rows: [u] } = await this.db.q("SELECT * FROM users WHERE email = $1", [em]);
      
      // Already finished signup (password set, or onboarded via Google without one)
      // -> straight in. Without the onboarded check, a passwordless Google user
      // would be asked to create a password on every single sign-in.
      if (u && (u.password || u.onboarded)) {
        await this.db.q("UPDATE users SET verified = TRUE WHERE email = $1", [em]);
        const token = await this.db.createSession(em);
        const user = Buffer.from(JSON.stringify(this.db.publicUser(u))).toString("base64url");
        // Tokens go in the #fragment: browsers never send it to servers, proxies or
        // Referer headers, so it stays out of access logs.
        return res.redirect(PUBLIC_URL + `/login#sso=${token}&u=${user}`);
      }
      
      // If user doesn't exist, register them with NULL password first
      if (!u) {
        // 'buyer/seller' is the valid role (plain 'buyer' fails the role checks and
        // hides the user's own listings in the dashboard).
        await this.db.q(`INSERT INTO users (email, name, password, role, verified) VALUES ($1,$2,NULL,'buyer/seller',TRUE)`,
          [em, clip(info.name, 80) || em]);
      }

      // Generate a temporary Google SSO token to let them set a password (for new accounts or passwordless accounts)
      const tempToken = await this.db.createSession(em, GOOGLE_TEMP_PREFIX);

      const name = u ? u.name : (clip(info.name, 80) || em);
      res.redirect(PUBLIC_URL + `/login#google_sso=1&temp_token=${tempToken}&email=${encodeURIComponent(em)}&name=${encodeURIComponent(name)}&has_password=false`);
    } catch (e) {
      console.error("Google SSO Callback error:", e);
      res.redirect(PUBLIC_URL + "/login?sso_error=" + encodeURIComponent("Google sign-in failed — try again"));
    }
  }

  @Post("google/confirm")
  async googleConfirm(@Body() body: any) {
    const { temp_token } = body;
    const password = typeof body.password === "string" ? body.password : "";
    if (typeof temp_token !== "string" || !temp_token.startsWith(GOOGLE_TEMP_PREFIX)) {
      throw err(400, "Invalid session");
    }

    // Retrieve email from the temp session (valid 10 minutes, single use)
    const { rows: [sess] } = await this.db.q(
      "SELECT * FROM sessions WHERE token = $1 AND created_at > now() - interval '10 minutes'", [this.db.hashToken(temp_token)]);
    if (!sess) throw err(400, "Google authentication session expired or invalid");

    const em = sess.email;
    const { rows: [u] } = await this.db.q("SELECT * FROM users WHERE email = $1", [em]);
    if (!u) throw err(404, "User not found");

    // Validate the new-account fields before the single-use token is spent, so a typo
    // doesn't force the user to start Google sign-in again.
    const role = u.password ? null : optOneOf(body.role, "Role", ROLES, "buyer/seller");
    const phone = u.password ? null : optPhone(body.phone);
    if (!u.password && password) newPassword(password);

    // Delete the temporary session (single use — also caps password guesses at one)
    await this.db.q("DELETE FROM sessions WHERE token = $1", [this.db.hashToken(temp_token)]);

    if (u.password) {
      // Linking Google to an existing password account — prove they own it.
      if (password.length > 128 || !this.db.checkPassword(password, u.password)) {
        throw err(401, "Incorrect password for this account");
      }
      await this.db.q("UPDATE users SET onboarded = TRUE WHERE email = $1", [em]);
    } else {
      // Password is optional: Google is already proof of identity. Only set one if
      // they actually want to be able to sign in with email/password too.
      if (password) {
        await this.db.q("UPDATE users SET password = $1, role = $2, phone = $3, onboarded = TRUE WHERE email = $4",
          [this.db.hashPassword(password), role, phone, em]);
      } else {
        await this.db.q("UPDATE users SET role = $1, phone = $2, onboarded = TRUE WHERE email = $3", [role, phone, em]);
      }
      u.role = role;
      u.phone = phone;
    }
    
    // Create a permanent session token
    const token = await this.db.createSession(em);
    return { token, user: this.db.publicUser(u) };
  }

  @Post("logout")
  async logout(@Req() req: any) {
    const token = this.db.bearer(req);
    await this.db.q("DELETE FROM sessions WHERE token IN ($1, $2)", [this.db.hashToken(token), token]);
    return { ok: true };
  }
}

@Controller()
export class MeController {
  constructor(private db: DbService) {}

  @Get("me")
  async me(@Req() req: any) {
    const user = await this.db.userFromRequest(req);
    if (!user) throw err(401, "Not logged in");
    return { user: this.db.publicUser(user) };
  }
}
