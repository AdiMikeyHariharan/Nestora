"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
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
const err = (code, msg) => new common_1.HttpException({ error: msg }, code);
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
        const otp = await this.db.issueOtp(em);
        return { needsOtp: true, email: em, ...(this.db.demoMode ? { demo_otp: otp } : {}) };
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
        const otp = await this.db.issueOtp(em);
        return { ok: true, ...(this.db.demoMode ? { demo_otp: otp } : {}) };
    }
    async login(body) {
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
