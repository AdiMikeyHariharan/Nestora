"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeoService = void 0;
// Geocoding: OSM Nominatim (precise) with Photon fallback (fuzzy, good for POI
// names like restaurants). In-memory cached. Keep the UA header — OSM policy.
const common_1 = require("@nestjs/common");
let GeoService = class GeoService {
    cache = new Map();
    distanceKm(lat1, lng1, lat2, lng2) {
        const R = 6371, toRad = (d) => d * Math.PI / 180;
        const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
    async geocode(text) {
        const key = text.trim().toLowerCase();
        if (this.cache.has(key))
            return this.cache.get(key);
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
        }
        catch { /* fall through to Photon */ }
        if (!results.length) {
            const url = "https://photon.komoot.io/api/?limit=5&lang=en&bbox=68,6,98,36&q=" + encodeURIComponent(text);
            const resp = await fetch(url, { headers: { "User-Agent": "NestoraDemo/1.0" } });
            if (!resp.ok)
                throw new Error("Geocoder unavailable");
            const data = await resp.json();
            results = (data.features || []).map((f) => {
                const pr = f.properties;
                const label = [pr.name, pr.city || pr.district, pr.state].filter(Boolean).join(", ");
                return {
                    name: label, full: label + (pr.country ? ", " + pr.country : ""),
                    lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], kind: pr.osm_value || "place"
                };
            });
        }
        this.cache.set(key, results);
        return results;
    }
};
exports.GeoService = GeoService;
exports.GeoService = GeoService = __decorate([
    (0, common_1.Injectable)()
], GeoService);
