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
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const core_1 = require("@nestjs/core");
const node_path_1 = require("node:path");
const express = __importStar(require("express"));
const app_module_1 = require("./app.module");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule, { bodyParser: false });
    app.setGlobalPrefix("api");
    app.use(express.json({ limit: "30mb" }));
    // Serve the built React client + SPA fallback for client-side routes
    const dist = (0, node_path_1.join)(__dirname, "..", "..", "client", "dist");
    app.useStaticAssets(dist);
    app.use((req, res, next) => {
        if (req.method === "GET" && !req.path.startsWith("/api") && !req.path.includes(".")) {
            return res.sendFile((0, node_path_1.join)(dist, "index.html"));
        }
        next();
    });
    const port = process.env.PORT || 4173;
    await app.listen(port);
    console.log(`Nestora (NestJS) on http://localhost:${port} — DB: ${process.env.DATABASE_URL || "postgresql://localhost:5433/nestora"}${process.env.SMTP_HOST ? "" : "  [demo email mode]"}`);
}
bootstrap();
