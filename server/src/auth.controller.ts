import { Body, Controller, Get, Post, Query, Req, Res, HttpException } from "@nestjs/common";
import { DbService } from "./db.service";

const err = (code: number, msg: string) => new HttpException({ error: msg }, code);
const PUBLIC_URL = process.env.PUBLIC_URL || "http://localhost:" + (process.env.PORT || 4173);

@Controller("auth")
export class AuthController {
  constructor(private db: DbService) {}

  @Post("signup")
  async signup(@Body() body: any) {
    const { name, email, password, role } = body;
    if (!name || !email || !password || password.length < 6)
      throw err(400, "Name, email and a 6+ char password are required");
    const em = email.trim().toLowerCase();
    const { rows } = await this.db.q("SELECT 1 FROM users WHERE email = $1", [em]);
    if (rows.length) throw err(409, "Account exists — please login");
    await this.db.q("INSERT INTO users (email,name,password,role) VALUES ($1,$2,$3,$4)",
      [em, name.trim(), this.db.hashPassword(password), role || "buyer"]);
    const otp = await this.db.issueOtp(em);
    return { needsOtp: true, email: em, ...(this.db.demoMode ? { demo_otp: otp } : {}) };
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
    const otp = await this.db.issueOtp(em);
    return { ok: true, ...(this.db.demoMode ? { demo_otp: otp } : {}) };
  }

  @Post("login")
  async login(@Body() body: any) {
    const em = (body.email || "").trim().toLowerCase();
    const { rows: [u] } = await this.db.q("SELECT * FROM users WHERE email = $1", [em]);
    if (!u || !this.db.checkPassword(body.password || "", u.password))
      throw err(401, "Invalid email or password");
    if (!u.verified) {
      const otp = await this.db.issueOtp(em);
      return { needsOtp: true, email: em, ...(this.db.demoMode ? { demo_otp: otp } : {}) };
    }
    const token = await this.db.createSession(em);
    return { token, user: this.db.publicUser(u) };
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
      // Google has verified the email — upsert as a verified, passwordless account
      await this.db.q(`INSERT INTO users (email, name, password, role, verified) VALUES ($1,$2,NULL,'buyer',TRUE)
        ON CONFLICT (email) DO UPDATE SET verified = TRUE, name = COALESCE(users.name, $2)`, [em, info.name || em]);
      const { rows: [u] } = await this.db.q("SELECT * FROM users WHERE email = $1", [em]);
      const token = await this.db.createSession(em);
      const user = Buffer.from(JSON.stringify(this.db.publicUser(u))).toString("base64url");
      res.redirect(`/login?sso=${token}&u=${user}`);
    } catch (e) {
      res.redirect("/login?sso_error=" + encodeURIComponent("Google sign-in failed — try again"));
    }
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
