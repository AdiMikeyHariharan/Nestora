import "dotenv/config";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { join } from "node:path";
import * as express from "express";
import { AppModule } from "./app.module";

// Keep in sync with the headers block in client/vercel.json (production serves the SPA from Vercel).
const CSP = [
  "default-src 'self'", "script-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'",
  "frame-ancestors 'none'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com", "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob: https:", "connect-src 'self' https:"
].join("; ");

// Fixed-window per-IP limiter. In memory, so it assumes a single server instance.
// Uses the first X-Forwarded-For hop (the client, behind Vercel/Render); when that's
// spoofed the limiter fails open rather than lumping real users together.
const hits = new Map<string, { n: number; reset: number }>();
const rateLimit = (name: string, max: number) => (req: any, res: any, next: any) => {
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress;
  const key = name + ":" + ip, now = Date.now();
  if (hits.size > 50_000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  const h = hits.get(key);
  if (!h || h.reset < now) { hits.set(key, { n: 1, reset: now + 60_000 }); return next(); }
  if (++h.n > max) return res.status(429).json({ error: "Too many requests — please wait a minute" });
  next();
};

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  app.setGlobalPrefix("api");
  app.disable("x-powered-by");
  app.use((req: any, res: any, next: any) => {
    res.setHeader("Content-Security-Policy", CSP);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(self)");
    next();
  });
  app.use("/api/auth", rateLimit("auth", 30));
  app.use("/api/chatbot", rateLimit("ai", 20));
  app.use("/api/chat/ask", rateLimit("ai", 20));
  app.use("/api/track", rateLimit("track", 120));
  app.use(express.json({ limit: "30mb" }));

  // Serve the built React client + SPA fallback for client-side routes
  const dist = join(__dirname, "..", "..", "client", "dist");
  app.useStaticAssets(dist);
  app.use((req: any, res: any, next: any) => {
    if (req.method === "GET" && !req.path.startsWith("/api") && !req.path.includes(".")) {
      return res.sendFile(join(dist, "index.html"));
    }
    next();
  });

  const port = process.env.PORT || 4173;
  await app.listen(port);
  const dbUrl = (process.env.DATABASE_URL || "postgresql://localhost:5433/nestora").replace(/\/\/([^:/@]+):[^@]*@/, "//$1:***@");
  console.log(`Nestora (NestJS) on http://localhost:${port} — DB: ${dbUrl}${process.env.SMTP_HOST ? "" : "  [demo email mode]"}`);
}
bootstrap();
