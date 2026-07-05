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
exports.PropertiesController = void 0;
const common_1 = require("@nestjs/common");
const db_service_1 = require("./db.service");
const geo_service_1 = require("./geo.service");
const err = (code, msg) => new common_1.HttpException({ error: msg }, code);
let PropertiesController = class PropertiesController {
    db;
    geo;
    constructor(db, geo) {
        this.db = db;
        this.geo = geo;
    }
    async geocode(text) {
        if (!text)
            throw err(400, "q required");
        try {
            return { results: await this.geo.geocode(text) };
        }
        catch {
            throw err(502, "Geocoder unavailable — try again");
        }
    }
    async list(p) {
        const where = [], params = [];
        const add = (sql, val) => { params.push(val); where.push(sql.replace("?", "$" + params.length)); };
        if (p.q)
            add("(city || ' ' || area) ILIKE ?", "%" + p.q + "%");
        if (p.pincode)
            add("pincode LIKE ?", p.pincode + "%");
        if (p.type)
            add("type = ?", p.type);
        if (p.category)
            add("category = ?", p.category);
        if (p.budget)
            add("price_inr <= ?", parseInt(p.budget, 10));
        if (p.minBudget)
            add("price_inr >= ?", parseInt(p.minBudget, 10));
        if (p.beds)
            add("beds = ?", parseFloat(p.beds));
        if (p.furnishing)
            add("furnishing = ?", p.furnishing);
        const { rows } = await this.db.q(`SELECT * FROM properties ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY created_at DESC`, params);
        let list = rows.map(r => this.db.toApiProp(r));
        // near=<lat>,<lng>&radius=<km> → haversine filter + distance sort
        const near = (p.near || "").split(",").map(Number);
        if (near.length === 2 && !near.some(isNaN)) {
            const radius = parseFloat(p.radius || "10");
            list = list
                .filter(x => x.lat != null && x.lng != null)
                .map(x => ({ ...x, distance_km: +this.geo.distanceKm(near[0], near[1], x.lat, x.lng).toFixed(1) }))
                .filter(x => x.distance_km <= radius)
                .sort((a, b) => a.distance_km - b.distance_km);
        }
        return { properties: list };
    }
    async one(id) {
        const { rows: [row] } = await this.db.q("SELECT * FROM properties WHERE id = $1", [id]);
        if (!row)
            throw err(404, "Not found");
        return { property: this.db.toApiProp(row) };
    }
    async create(body, req) {
        const user = await this.db.userFromRequest(req);
        if (!user)
            throw err(401, "Login required");
        if (!user.verified)
            throw err(403, "Verify your email first");
        for (const f of ["title", "type", "category", "city", "area", "pincode", "priceINR", "beds", "baths", "sqft", "desc"])
            if (body[f] === undefined || body[f] === "")
                throw err(400, "Missing field: " + f);
        const id = this.db.uid("prop");
        // best-effort geocode of the locality so the listing appears in geo search
        let lat = body.lat ?? null, lng = body.lng ?? null;
        if (lat == null || lng == null) {
            try {
                const g = await this.geo.geocode(`${body.area}, ${body.city}, India`);
                if (g[0]) {
                    lat = g[0].lat;
                    lng = g[0].lng;
                }
            }
            catch { /* listing still saved without coords */ }
        }
        await this.db.q(`INSERT INTO properties (id,title,type,category,city,area,pincode,price_inr,beds,baths,sqft,description,img,photos,video,posted_by,role,lat,lng,furnishing)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,${["unfurnished", "semi", "furnished"].includes(body.furnishing) ? "'" + body.furnishing + "'" : "'unfurnished'"})`, [id, body.title, body.type, body.category, body.city, body.area, body.pincode,
            parseInt(body.priceINR, 10), parseFloat(body.beds), parseInt(body.baths, 10), parseInt(body.sqft, 10),
            body.desc, body.img || body.photos?.[0] || `https://picsum.photos/seed/${id}/800/500`,
            JSON.stringify(body.photos || []), body.video || null, user.email, body.role || user.role, lat, lng]);
        return { id };
    }
    async remove(id, req) {
        const user = await this.db.userFromRequest(req);
        if (!user)
            throw err(401, "Login required");
        const { rows: [row] } = await this.db.q("SELECT posted_by FROM properties WHERE id = $1", [id]);
        if (!row)
            throw err(404, "Not found");
        if (row.posted_by !== user.email)
            throw err(403, "Not your listing");
        await this.db.q("DELETE FROM properties WHERE id = $1", [id]);
        return { ok: true };
    }
};
exports.PropertiesController = PropertiesController;
__decorate([
    (0, common_1.Get)("geocode"),
    __param(0, (0, common_1.Query)("q")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PropertiesController.prototype, "geocode", null);
__decorate([
    (0, common_1.Get)("properties"),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PropertiesController.prototype, "list", null);
__decorate([
    (0, common_1.Get)("properties/:id"),
    __param(0, (0, common_1.Param)("id")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PropertiesController.prototype, "one", null);
__decorate([
    (0, common_1.Post)("properties"),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], PropertiesController.prototype, "create", null);
__decorate([
    (0, common_1.Delete)("properties/:id"),
    __param(0, (0, common_1.Param)("id")),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], PropertiesController.prototype, "remove", null);
exports.PropertiesController = PropertiesController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [db_service_1.DbService, geo_service_1.GeoService])
], PropertiesController);
