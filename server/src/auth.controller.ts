import { Body, Controller, Get, Post, Req, HttpException } from "@nestjs/common";
import { DbService } from "./db.service";

const err = (code: number, msg: string) => new HttpException({ error: msg }, code);

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
