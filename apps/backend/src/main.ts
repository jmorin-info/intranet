import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

// Load .env from project root if env vars are missing
const rootEnv = resolve(__dirname, "../../../.env");
if (existsSync(rootEnv) && !process.env.DATABASE_URL) {
  const lines = readFileSync(rootEnv, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx);
    const value = trimmed.slice(eqIdx + 1);
    if (!process.env[key]) process.env[key] = value;
  }
}

// IMPORTANT: Sentry must be initialised BEFORE any other module that may
// throw, so its instrumentation can capture early errors (DB connect, etc.).
// This is a no-op if SENTRY_DSN is unset — Sentry is 100% opt-in.
import { initSentry, isSentryEnabled } from "./common/sentry.init";
initSentry();

import { NestFactory, HttpAdapterHost } from "@nestjs/core";
import { ValidationPipe, Logger } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { NestExpressApplication } from "@nestjs/platform-express";
import { Logger as PinoLogger } from "nestjs-pino";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { join } from "path";
import { AppModule } from "./app.module";
import { ApiSocketIoAdapter } from "./socket-io-adapter";
import { SentryExceptionFilter } from "./common/sentry.filter";
import { AppMetricsService } from "./health/app-metrics.service";
import { blockPrivateUploads } from "./common/private-uploads.middleware";

async function bootstrap() {
  const logger = new Logger("Bootstrap");
  // rawBody: true — requis pour valider les signatures HMAC des webhooks
  // externes (DocuSeal, etc.) sur le body brut (ISO 27001 A.8.26).
  // Voir apps/backend/src/signatures/webhook.controller.ts.
  // bufferLogs: true — bufferise les logs de bootstrap pour les rejouer
  // dans le logger Pino dès qu'il est instancié.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    bufferLogs: true,
  });

  // Switch the Nest logger to Pino (structured JSON + X-Request-ID).
  app.useLogger(app.get(PinoLogger));

  // Serve uploaded files (wiki attachments, certificates, etc.)
  const uploadsDir = join(process.cwd(), "uploads");
  app.use(blockPrivateUploads);
  app.useStaticAssets(uploadsDir, { prefix: "/uploads/" });

  // Enable strong ETags on GET responses so clients get automatic 304 Not
  // Modified when sending If-None-Match (bandwidth + latency savings on lists).
  const httpAdapter: any = app.getHttpAdapter().getInstance();
  if (httpAdapter && typeof httpAdapter.set === "function") {
    httpAdapter.set("etag", "strong");
    // Derrière BunkerWeb : faire confiance à X-Forwarded-* pour récupérer l'IP client réelle
    // (rate-limiting, logs d'audit, détection brute-force).
    httpAdapter.set("trust proxy", process.env.TRUST_PROXY || "loopback, linklocal, uniquelocal");
  }

  // Fail fast if critical secrets are missing
  const requiredEnvVars = ["DATABASE_URL", "JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"];
  // CRYPTO_SECRET only required in prod (dev fallback dérive de JWT_ACCESS_SECRET) :
  // sinon une rotation des secrets JWT invaliderait silencieusement les tokens
  // OAuth chiffrés au repos (Google Calendar, Outlook).
  // STORAGE_SECRET idem : sans cette variable en prod, la signature HMAC des
  // URLs de téléchargement retombe sur le fallback codé en dur
  // 'storage-secret-change-me' (audit sécurité P0-5).
  if (process.env.NODE_ENV === "production") {
    requiredEnvVars.push("CRYPTO_SECRET");
    requiredEnvVars.push("STORAGE_SECRET");
  }
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      logger.error(`FATAL: Missing required environment variable: ${envVar}`);
      process.exit(1);
    }
  }

  // Socket.IO adapter custom pour utiliser /api/socket.io (traverse BunkerWeb)
  app.useWebSocketAdapter(new ApiSocketIoAdapter(app));

  app.use(cookieParser());

  const isProduction = process.env.NODE_ENV === "production";

  // Si un CDN externe est configuré (NEXT_PUBLIC_CDN_URL), on l'autorise
  // dans la CSP scriptSrc/styleSrc/imgSrc/fontSrc/connectSrc — sinon les
  // assets _next/static/* servis depuis le CDN seront bloqués par la CSP.
  const cdnOrigin = (() => {
    try {
      const url = process.env.NEXT_PUBLIC_CDN_URL?.trim();
      if (!url) return null;
      return new URL(url).origin;
    } catch {
      return null;
    }
  })();
  const cdnSources = cdnOrigin ? [cdnOrigin] : [];

  app.use(
    helmet({
      // Disable CSP in dev to avoid breaking Swagger UI (inline scripts).
      contentSecurityPolicy: isProduction
        ? {
            useDefaults: false,
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'", ...cdnSources],
              // Tailwind / runtime styles need inline
              styleSrc: ["'self'", "'unsafe-inline'", ...cdnSources],
              imgSrc: ["'self'", "data:", "https:", ...cdnSources],
              connectSrc: ["'self'", "wss:", ...cdnSources],
              fontSrc: ["'self'", "data:", ...cdnSources],
              objectSrc: ["'none'"],
              baseUri: ["'self'"],
              formAction: ["'self'"],
              frameAncestors: ["'none'"],
              upgradeInsecureRequests: [],
            },
          }
        : false,
      hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
      // frameguard: SAMEORIGIN pour permettre OnlyOffice/Stirling sur le même domaine
      // tout en bloquant le clickjacking depuis des domaines tiers (ISO 27001 A.8.28)
      frameguard: { action: "sameorigin" },
      noSniff: true,
      xssFilter: true,
      // COEP désactivé : OnlyOffice/DocuSeal/Stirling sont chargés en iframe et
      // n'envoient pas Cross-Origin-Embedder-Policy compatible. Activer COEP
      // casserait ces intégrations. Le risque résiduel (Spectre cross-origin)
      // est mitigé par CORP same-site + COOP same-origin ci-dessous.
      crossOriginEmbedderPolicy: false,
      // COOP same-origin : isole le browsing context contre les attaques
      // XS-Leaks (window.opener cross-origin) — ANSSI / OWASP A05.
      crossOriginOpenerPolicy: { policy: "same-origin" },
      // CORP same-site : par défaut on protège les ressources contre l'embedding
      // par un domaine tiers. Les routes qui doivent rester cross-origin
      // (uploads servis à OnlyOffice depuis un autre port en dev) sont gérées
      // au niveau du contrôleur si besoin. En prod, tout vit derrière BunkerWeb
      // sur le même eTLD+1, donc same-site est suffisant.
      crossOriginResourcePolicy: { policy: "same-site" },
    }),
  );

  // ─── CORS — séparation stricte dev / prod ───────────────────────────
  // CORS_ORIGINS  : liste explicite des origines autorisées (prod + dev).
  // CORS_ORIGINS_DEV : liste *additionnelle* injectée UNIQUEMENT hors prod
  //   (typiquement les services internes OnlyOffice/Stirling sur ports
  //   :8080/:8082, et les ports Vite dev). En staging/prod, ces origines ne
  //   sont JAMAIS auto-injectées — il faut les déclarer dans CORS_ORIGINS si
  //   réellement nécessaire.
  const parseOrigins = (raw?: string): string[] =>
    raw
      ? raw
          .split(",")
          .map((o) => o.trim())
          .filter(Boolean)
      : [];

  const baseOrigins = parseOrigins(process.env.CORS_ORIGINS);
  const devOrigins = parseOrigins(process.env.CORS_ORIGINS_DEV);
  const defaultDevOrigins = ["http://localhost:3001", "http://localhost:5173"];

  const allowedOrigins = isProduction
    ? baseOrigins
    : Array.from(
        new Set([
          ...(baseOrigins.length > 0 ? baseOrigins : defaultDevOrigins),
          // Si CORS_ORIGINS_DEV n'est pas défini, on garde le comportement
          // legacy (services internes OnlyOffice :8080 / Stirling :8082) en dev.
          ...(devOrigins.length > 0
            ? devOrigins
            : ["http://localhost:8080", "http://localhost:8082"]),
        ]),
      );

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      // Requêtes same-origin (SSR, curl, healthchecks) : pas d'en-tête Origin.
      if (!origin) {
        return callback(null, true);
      }
      // Origines autorisées explicitement.
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      // Prod : tout le reste est refusé.
      return callback(new Error(`Origin not allowed by CORS: ${origin}`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.setGlobalPrefix("api/v1");

  // ── Prometheus HTTP request middleware ────────────────────────
  // Counts every request + observes its duration. Wired BEFORE the
  // API-versioning middleware so the route-rewrite (`/api/*` → `/api/v1/*`)
  // is captured under a single metric. We label by `route` (the matched
  // express path, NOT the raw URL — keeps cardinality bounded), `method`
  // and `statusCode`. Skips the metrics endpoint itself to avoid feedback
  // loops on each scrape.
  const appMetrics = app.get(AppMetricsService);
  const expressAppRoot = app.getHttpAdapter().getInstance();
  expressAppRoot.use((req: any, res: any, next: any) => {
    // Don't account for the scrape endpoint itself.
    if (req.url && req.url.startsWith("/api/health/metrics")) {
      return next();
    }
    const start = process.hrtime.bigint();
    res.on("finish", () => {
      try {
        const elapsed = Number(process.hrtime.bigint() - start) / 1e9;
        // Prefer the matched route (e.g. /api/v1/tickets/:id) when express
        // has resolved it; fall back to the raw path otherwise. We strip
        // query strings to keep cardinality finite.
        const route =
          (req.route && req.route.path) ||
          (req.baseUrl && req.path && `${req.baseUrl}${req.path}`) ||
          (typeof req.url === "string" ? req.url.split("?")[0] : "unknown");
        const method = String(req.method || "GET");
        const statusCode = String(res.statusCode || 0);
        appMetrics.httpRequestsTotal.inc({ route, method, statusCode });
        appMetrics.httpRequestDurationSeconds.observe({ route, method }, elapsed);
      } catch {
        // metrics must never break the request lifecycle
      }
    });
    next();
  });

  // ── API Versioning: Backward-compatibility layer ──────────────
  // Redirect /api/* → /api/v1/* for existing consumers.
  // This ensures zero breaking changes during the migration period.
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.use("/api", (req: any, res: any, next: any) => {
    // Skip if already on /api/v1
    if (req.url.startsWith("/v1")) return next();
    // Skip Swagger docs
    if (req.url.startsWith("/docs")) return next();
    // Skip static uploads
    if (req.url.startsWith("/uploads")) return next();
    // Rewrite to versioned endpoint
    req.url = "/v1" + req.url;
    // Add deprecation header
    res.setHeader("X-API-Version", "v1");
    res.setHeader("Deprecation", "true");
    res.setHeader("Sunset", "2026-10-01");
    next();
  });

  // Add version header to all /api/v1 responses
  expressApp.use("/api/v1", (_req: any, res: any, next: any) => {
    res.setHeader("X-API-Version", "v1");
    next();
  });

  // Swagger / OpenAPI documentation (ISO 27001 A.5.37)
  const swaggerConfig = new DocumentBuilder()
    .setTitle("OMNITECH Intranet API")
    .setDescription("ISO 27001:2022 — Système de gestion documentaire sécurisé")
    .setVersion("1.0")
    .addBearerAuth()
    .addTag("auth", "Authentification et MFA")
    .addTag("chartes", "Chartes obligatoires PDF (A.6.2)")
    .addTag("documents", "GED — Gestion documentaire (A.5.1)")
    .addTag("veille", "Veille cybersécurité CERT-FR/ANSSI (A.5.7)")
    .addTag("external-access", "Portail prestataires (A.5.19)")
    .addTag("tickets", "Helpdesk IT")
    .addTag("audit", "Journal d'audit (A.5.36)")
    .addTag("incidents", "Gestion des incidents (A.5.24)")
    .addTag("it-exports", "Exports IT & Conformite (A.8.13)")
    .addTag("access-reviews", "Revue des acces (A.5.18)")
    .addTag("calendar", "Calendrier & evenements")
    .addTag("office", "OnlyOffice Docs")
    .addTag("stirling", "Stirling PDF")
    .addTag("data-retention", "Politique de retention (A.5.33)")
    .addTag("spaces", "Espaces & modules")
    .addTag("push", "Notifications push (VAPID)")
    .addTag("saved-filters", "Filtres sauvegardes")
    .build();
  const swaggerDoc = SwaggerModule.createDocument(app, swaggerConfig);
  // Swagger uniquement hors production (ANSSI R1 : ne pas exposer la doc API)
  if (!isProduction) {
    SwaggerModule.setup("api/v1/docs", app, swaggerDoc);
    logger.log("Swagger UI available at /api/v1/docs (dev only)");
  }

  // Global exception filter — sends 5xx + uncaught errors to Sentry
  // (no-op if SENTRY_DSN is missing) and falls back to the default
  // Nest behaviour for the HTTP response.
  const httpAdapterHost = app.get(HttpAdapterHost);
  app.useGlobalFilters(new SentryExceptionFilter(httpAdapterHost.httpAdapter));
  if (isSentryEnabled()) {
    logger.log("Sentry error reporting: ENABLED");
  }

  // Statut SIEM au bootstrap (visibilité ops) — no-op si SIEM_ENABLED!=='true'.
  if (process.env.SIEM_ENABLED === "true") {
    logger.log(
      `SIEM forwarding: ENABLED → GELF ${process.env.SIEM_GELF_HOST}:${process.env.SIEM_GELF_PORT || 12201}`,
    );
  }

  const port = process.env.PORT || 3000;
  const host = process.env.HOST || "0.0.0.0";
  await app.listen(port, host);
  logger.log(`OMNITECH Intranet API running on ${host}:${port}`);
}

bootstrap();
