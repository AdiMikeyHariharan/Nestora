import "dotenv/config";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { join } from "node:path";
import * as express from "express";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  app.setGlobalPrefix("api");
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
  console.log(`Nestora (NestJS) on http://localhost:${port} — DB: ${process.env.DATABASE_URL || "postgresql://localhost:5433/nestora"}${process.env.SMTP_HOST ? "" : "  [demo email mode]"}`);
}
bootstrap();
