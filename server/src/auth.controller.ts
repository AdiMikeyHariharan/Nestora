import { Body, Controller, Get, Post, Query, Req, Res, HttpException } from "@nestjs/common";
import { DbService } from "./db.service";
import * as crypto from "node:crypto";

const err = (code: number, msg: string) => new HttpException({ error: msg }, code);
const PUBLIC_URL = process.env.PUBLIC_URL || "http://localhost:" + (process.env.PORT || 4173);

@Controller("auth")
export class AuthController {
  constructor(private db: DbService) {}

  @Post("signup")
  async signup(@Body() body: any) {
    const { name, email, password, role, phone } = body;
    if (!name || !email || !password || password.length < 6)
      throw err(400, "Name, email and a 6+ char password are required");
    if (!role || !["buyer/seller", "agent"].includes(role))
      throw err(400, "Valid role is required (buyer/seller or agent)");
    const em = email.trim().toLowerCase();
    const { rows } = await this.db.q("SELECT 1 FROM users WHERE email = $1", [em]);
    if (rows.length) throw err(409, "Account exists — please login");
    await this.db.q("INSERT INTO users (email,name,password,role,phone) VALUES ($1,$2,$3,$4,$5)",
      [em, name.trim(), this.db.hashPassword(password), role, phone || null]);
    await this.db.issueOtp(em);
    return { needsOtp: true, email: em };
  }

  @Post("verify")
  async verify(@Body() body: any) {
    const em = (body.email || "").trim().toLowerCase();
    const { rows: [u] } = await this.db.q("SELECT * FROM users WHERE email = $1", [em]);
    if (!u) throw err(404, "No such account");
    if (!u.otp || u.otp !== body.otp) throw err(400, "Incorrect OTP");
    if (Date.now() > Number(u.otp_expires)) throw err(400, "OTP expired — resend a new one");
    await this.db.q("UPDATE users SET verified = TRUE, otp = NULL WHERE email = $1", [em]);
    const token = await this.db.createSession(em);
    return { token, user: this.db.publicUser({ ...u, verified: true }) };
  }

  @Post("resend")
  async resend(@Body() body: any) {
    const em = (body.email || "").trim().toLowerCase();
    const { rows } = await this.db.q("SELECT 1 FROM users WHERE email = $1", [em]);
    if (!rows.length) throw err(404, "No such account");
    await this.db.issueOtp(em);
    return { ok: true };
  }

  @Post("login")
  async login(@Body() body: any) {
    const em = (body.email || "").trim().toLowerCase();
    const { rows: [u] } = await this.db.q("SELECT * FROM users WHERE email = $1", [em]);
    if (!u || !u.password || !this.db.checkPassword(body.password || "", u.password))
      throw err(401, "Invalid email or password");
    const token = await this.db.createSession(em);
    return { token, user: this.db.publicUser(u) };
  }

  @Post("login-otp")
  async loginOtp(@Body() body: any) {
    const em = (body.email || "").trim().toLowerCase();
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
  googleStart(@Res() res: any) {
    if (!process.env.GOOGLE_CLIENT_ID)
      return res.status(501).json({ error: "Google SSO not configured — set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET" });
    const url = "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      redirect_uri: PUBLIC_URL + "/api/auth/google/callback",
      response_type: "code", scope: "openid email profile", prompt: "select_account"
    });
    res.redirect(url);
  }

  @Get("google/callback")
  async googleCallback(@Query("code") code: string, @Res() res: any) {
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
      const em = info.email.toLowerCase();
      
      // Check if user already exists
      const { rows: [u] } = await this.db.q("SELECT * FROM users WHERE email = $1", [em]);
      
      if (u && u.password) {
        // Log in directly since the user already exists and has a password
        await this.db.q("UPDATE users SET verified = TRUE WHERE email = $1", [em]);
        const token = await this.db.createSession(em);
        const user = Buffer.from(JSON.stringify(this.db.publicUser(u))).toString("base64url");
        return res.redirect(PUBLIC_URL + `/login?sso=${token}&u=${user}`);
      }
      
      // If user doesn't exist, register them with NULL password first
      if (!u) {
        await this.db.q(`INSERT INTO users (email, name, password, role, verified) VALUES ($1,$2,NULL,'buyer',TRUE)`, 
          [em, info.name || em]);
      }
      
      // Generate a temporary Google SSO token to let them set a password (for new accounts or passwordless accounts)
      const tempToken = "google-temp-" + crypto.randomBytes(24).toString("hex");
      await this.db.q("INSERT INTO sessions (token, email) VALUES ($1, $2)", [tempToken, em]);
      
      const name = u ? u.name : (info.name || em);
      res.redirect(PUBLIC_URL + `/login?google_sso=1&temp_token=${tempToken}&email=${em}&name=${encodeURIComponent(name)}&has_password=false`);
    } catch (e) {
      console.error("Google SSO Callback error:", e);
      res.redirect(PUBLIC_URL + "/login?sso_error=" + encodeURIComponent("Google sign-in failed — try again"));
    }
  }

  @Post("google/confirm")
  async googleConfirm(@Body() body: any) {
    const { temp_token, password } = body;
    if (!temp_token || !temp_token.startsWith("google-temp-")) {
      throw err(400, "Invalid session");
    }
    
    // Retrieve email from session
    const { rows: [sess] } = await this.db.q("SELECT * FROM sessions WHERE token = $1", [temp_token]);
    if (!sess) throw err(400, "Google authentication session expired or invalid");
    
    const em = sess.email;
    const { rows: [u] } = await this.db.q("SELECT * FROM users WHERE email = $1", [em]);
    if (!u) throw err(404, "User not found");
    
    // Delete the temporary session
    await this.db.q("DELETE FROM sessions WHERE token = $1", [temp_token]);
    
    if (u.password) {
      // User already has a password, we must verify it
      if (!this.db.checkPassword(password || "", u.password)) {
        throw err(401, "Incorrect password for this account");
      }
    } else {
      // User does not have a password, we set it
      if (!password || password.length < 6) {
        throw err(400, "Password must be at least 6 characters");
      }
      
      const role = body.role || "buyer/seller";
      if (!["buyer/seller", "agent"].includes(role)) throw err(400, "Valid role is required");
      const phone = body.phone || null;

      await this.db.q("UPDATE users SET password = $1, role = $2, phone = $3 WHERE email = $4", [this.db.hashPassword(password), role, phone, em]);
      u.role = role;
      u.phone = phone;
    }
    
    // Create a permanent session token
    const token = await this.db.createSession(em);
    return { token, user: this.db.publicUser(u) };
  }

  @Post("logout")
  async logout(@Req() req: any) {
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    await this.db.q("DELETE FROM sessions WHERE token = $1", [token]);
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
