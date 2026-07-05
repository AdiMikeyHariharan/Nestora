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
exports.MeController = exports.AuthController = void 0;
const common_1 = require("@nestjs/common");
const db_service_1 = require("./db.service");
const crypto = __importStar(require("node:crypto"));
const err = (code, msg) => new common_1.HttpException({ error: msg }, code);
const PUBLIC_URL = process.env.PUBLIC_URL || "http://localhost:" + (process.env.PORT || 4173);
let AuthController = class AuthController {
    db;
    constructor(db) {
        this.db = db;
    }
    async signup(body) {
        const { name, email, password, role } = body;
        if (!name || !email || !password || password.length < 6)
            throw err(400, "Name, email and a 6+ char password are required");
        const em = email.trim().toLowerCase();
        const { rows } = await this.db.q("SELECT 1 FROM users WHERE email = $1", [em]);
        if (rows.length)
            throw err(409, "Account exists — please login");
        await this.db.q("INSERT INTO users (email,name,password,role) VALUES ($1,$2,$3,$4)", [em, name.trim(), this.db.hashPassword(password), role || "buyer"]);
        await this.db.issueOtp(em);
        return { needsOtp: true, email: em };
    }
    async verify(body) {
        const em = (body.email || "").trim().toLowerCase();
        const { rows: [u] } = await this.db.q("SELECT * FROM users WHERE email = $1", [em]);
        if (!u)
            throw err(404, "No such account");
        if (!u.otp || u.otp !== body.otp)
            throw err(400, "Incorrect OTP");
        if (Date.now() > Number(u.otp_expires))
            throw err(400, "OTP expired — resend a new one");
        await this.db.q("UPDATE users SET verified = TRUE, otp = NULL WHERE email = $1", [em]);
        const token = await this.db.createSession(em);
        return { token, user: this.db.publicUser({ ...u, verified: true }) };
    }
    async resend(body) {
        const em = (body.email || "").trim().toLowerCase();
        const { rows } = await this.db.q("SELECT 1 FROM users WHERE email = $1", [em]);
        if (!rows.length)
            throw err(404, "No such account");
        await this.db.issueOtp(em);
        return { ok: true };
    }
    async login(body) {
        const em = (body.email || "").trim().toLowerCase();
        const { rows: [u] } = await this.db.q("SELECT * FROM users WHERE email = $1", [em]);
        if (!u || !u.password || !this.db.checkPassword(body.password || "", u.password))
            throw err(401, "Invalid email or password");
        const token = await this.db.createSession(em);
        return { token, user: this.db.publicUser(u) };
    }
    async loginOtp(body) {
        const em = (body.email || "").trim().toLowerCase();
        const { rows: [u] } = await this.db.q("SELECT * FROM users WHERE email = $1", [em]);
        if (!u)
            throw err(404, "No account found with this email");
        await this.db.issueOtp(em);
        return { needsOtp: true, email: em };
    }
    // ---- SSO (Google OAuth 2.0 authorization-code flow) ----
    // Needs GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET (Google Cloud Console →
    // OAuth client, redirect URI: <PUBLIC_URL>/api/auth/google/callback).
    ssoStatus() {
        return { google: !!process.env.GOOGLE_CLIENT_ID };
    }
    googleStart(res) {
        if (!process.env.GOOGLE_CLIENT_ID)
            return res.status(501).json({ error: "Google SSO not configured — set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET" });
        const url = "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({
            client_id: process.env.GOOGLE_CLIENT_ID,
            redirect_uri: PUBLIC_URL + "/api/auth/google/callback",
            response_type: "code", scope: "openid email profile", prompt: "select_account"
        });
        res.redirect(url);
    }
    async googleCallback(code, res) {
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
            const { access_token } = await tokenResp.json();
            const info = await (await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { Authorization: "Bearer " + access_token } })).json();
            if (!info.email)
                throw new Error("no email from Google");
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
                await this.db.q(`INSERT INTO users (email, name, password, role, verified) VALUES ($1,$2,NULL,'buyer',TRUE)`, [em, info.name || em]);
            }
            // Generate a temporary Google SSO token to let them set a password (for new accounts or passwordless accounts)
            const tempToken = "google-temp-" + crypto.randomBytes(24).toString("hex");
            await this.db.q("INSERT INTO sessions (token, email) VALUES ($1, $2)", [tempToken, em]);
            const name = u ? u.name : (info.name || em);
            res.redirect(PUBLIC_URL + `/login?google_sso=1&temp_token=${tempToken}&email=${em}&name=${encodeURIComponent(name)}&has_password=false`);
        }
        catch (e) {
            console.error("Google SSO Callback error:", e);
            res.redirect(PUBLIC_URL + "/login?sso_error=" + encodeURIComponent("Google sign-in failed — try again"));
        }
    }
    async googleConfirm(body) {
        const { temp_token, password } = body;
        if (!temp_token || !temp_token.startsWith("google-temp-")) {
            throw err(400, "Invalid session");
        }
        // Retrieve email from session
        const { rows: [sess] } = await this.db.q("SELECT * FROM sessions WHERE token = $1", [temp_token]);
        if (!sess)
            throw err(400, "Google authentication session expired or invalid");
        const em = sess.email;
        const { rows: [u] } = await this.db.q("SELECT * FROM users WHERE email = $1", [em]);
        if (!u)
            throw err(404, "User not found");
        // Delete the temporary session
        await this.db.q("DELETE FROM sessions WHERE token = $1", [temp_token]);
        if (u.password) {
            // User already has a password, we must verify it
            if (!this.db.checkPassword(password || "", u.password)) {
                throw err(401, "Incorrect password for this account");
            }
        }
        else {
            // User does not have a password, we set it
            if (!password || password.length < 6) {
                throw err(400, "Password must be at least 6 characters");
            }
            await this.db.q("UPDATE users SET password = $1 WHERE email = $2", [this.db.hashPassword(password), em]);
        }
        // Create a permanent session token
        const token = await this.db.createSession(em);
        return { token, user: this.db.publicUser(u) };
    }
    async logout(req) {
        const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
        await this.db.q("DELETE FROM sessions WHERE token = $1", [token]);
        return { ok: true };
    }
};
exports.AuthController = AuthController;
__decorate([
    (0, common_1.Post)("signup"),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "signup", null);
__decorate([
    (0, common_1.Post)("verify"),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "verify", null);
__decorate([
    (0, common_1.Post)("resend"),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "resend", null);
__decorate([
    (0, common_1.Post)("login"),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "login", null);
__decorate([
    (0, common_1.Post)("login-otp"),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "loginOtp", null);
__decorate([
    (0, common_1.Get)("sso/status"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "ssoStatus", null);
__decorate([
    (0, common_1.Get)("google"),
    __param(0, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "googleStart", null);
__decorate([
    (0, common_1.Get)("google/callback"),
    __param(0, (0, common_1.Query)("code")),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "googleCallback", null);
__decorate([
    (0, common_1.Post)("google/confirm"),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "googleConfirm", null);
__decorate([
    (0, common_1.Post)("logout"),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "logout", null);
exports.AuthController = AuthController = __decorate([
    (0, common_1.Controller)("auth"),
    __metadata("design:paramtypes", [db_service_1.DbService])
], AuthController);
let MeController = class MeController {
    db;
    constructor(db) {
        this.db = db;
    }
    async me(req) {
        const user = await this.db.userFromRequest(req);
        if (!user)
            throw err(401, "Not logged in");
        return { user: this.db.publicUser(user) };
    }
};
exports.MeController = MeController;
__decorate([
    (0, common_1.Get)("me"),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], MeController.prototype, "me", null);
exports.MeController = MeController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [db_service_1.DbService])
], MeController);
