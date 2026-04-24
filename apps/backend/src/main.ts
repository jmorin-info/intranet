import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// Load .env from project root if env vars are missing
const rootEnv = resolve(__dirname, '../../../.env');
if (existsSync(rootEnv) && !process.env.DATABASE_URL) {
  const lines = readFileSync(rootEnv, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx);
    const value = trimmed.slice(eqIdx + 1);
    if (!process.env[key]) process.env[key] = value;
  }
}

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { join } from 'path';
import { AppModule } from './app.module';
import { ApiSocketIoAdapter } from './socket-io-adapter';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  // rawBody: true — requis pour valider les signatures HMAC des webhooks
  // externes (DocuSeal, etc.) sur le body brut (ISO 27001 A.8.26).
  // Voir apps/backend/src/signatures/webhook.controller.ts.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });

  // Serve uploaded files (wiki attachments, certificates, etc.)
  const uploadsDir = join(process.cwd(), 'uploads');
  app.useStaticAssets(uploadsDir, { prefix: '/uploads/' });

  // Enable strong ETags on GET responses so clients get automatic 304 Not
  // Modified when sending If-None-Match (bandwidth + latency savings on lists).
  const httpAdapter: any = app.getHttpAdapter().getInstance();
  if (httpAdapter && typeof httpAdapter.set === 'function') {
    httpAdapter.set('etag', 'strong');
    // Derrière BunkerWeb : faire confiance à X-Forwarded-* pour récupérer l'IP client réelle
    // (rate-limiting, logs d'audit, détection brute-force).
    httpAdapter.set('trust proxy', process.env.TRUST_PROXY || 'loopback, linklocal, uniquelocal');
  }

  // Fail fast if critical secrets are missing
  const requiredEnvVars = ['DATABASE_URL', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'];
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      logger.error(`FATAL: Missing required environment variable: ${envVar}`);
      process.exit(1);
    }
  }

  // Socket.IO adapter custom pour utiliser /api/socket.io (traverse BunkerWeb)
  app.useWebSocketAdapter(new ApiSocketIoAdapter(app));

  app.use(cookieParser());

  const isProduction = process.env.NODE_ENV === 'production';
  app.use(
    helmet({
      // Disable CSP in dev to avoid breaking Swagger UI (inline scripts).
      contentSecurityPolicy: isProduction
        ? {
            useDefaults: false,
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              // Tailwind / runtime styles need inline
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", 'data:', 'https:'],
              connectSrc: ["'self'", 'wss:'],
              fontSrc: ["'self'", 'data:'],
              objectSrc: ["'none'"],
              baseUri: ["'self'"],
              formAction: ["'self'"],
              frameAncestors: ["'none'"],
              upgradeInsecureRequests: [],
            },
          }
        : false,
      hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      // frameguard: SAMEORIGIN pour permettre OnlyOffice/Stirling sur le même domaine
      // tout en bloquant le clickjacking depuis des domaines tiers (ISO 27001 A.8.28)
      frameguard: { action: 'sameorigin' },
      noSniff: true,
      xssFilter: true,
      crossOriginEmbedderPolicy: false,
      // CORP : cross-origin pour que OnlyOffice/Stirling puissent charger les assets (logos, fichiers)
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((origin) => origin.trim())
    : ['http://localhost:3001', 'http://localhost:5173'];

  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Requêtes same-origin (SSR, curl, healthchecks) : pas d'en-tête Origin.
      if (!origin) {
        return callback(null, true);
      }
      // Origines autorisées explicitement par CORS_ORIGINS.
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      // Services internes (OnlyOffice / Stirling) : autorisés uniquement hors prod.
      if (!isProduction && (origin.includes(':8082') || origin.includes(':8080'))) {
        return callback(null, true);
      }
      // Prod : tout le reste est refusé.
      return callback(new Error(`Origin not allowed by CORS: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.setGlobalPrefix('api/v1');

  // ── API Versioning: Backward-compatibility layer ──────────────
  // Redirect /api/* → /api/v1/* for existing consumers.
  // This ensures zero breaking changes during the migration period.
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.use('/api', (req: any, res: any, next: any) => {
    // Skip if already on /api/v1
    if (req.url.startsWith('/v1')) return next();
    // Skip Swagger docs
    if (req.url.startsWith('/docs')) return next();
    // Skip static uploads
    if (req.url.startsWith('/uploads')) return next();
    // Rewrite to versioned endpoint
    req.url = '/v1' + req.url;
    // Add deprecation header
    res.setHeader('X-API-Version', 'v1');
    res.setHeader('Deprecation', 'true');
    res.setHeader('Sunset', '2026-10-01');
    next();
  });

  // Add version header to all /api/v1 responses
  expressApp.use('/api/v1', (_req: any, res: any, next: any) => {
    res.setHeader('X-API-Version', 'v1');
    next();
  });

  // Swagger / OpenAPI documentation (ISO 27001 A.5.37)
  const swaggerConfig = new DocumentBuilder()
    .setTitle('OMNITECH Intranet API')
    .setDescription('ISO 27001:2022 — Système de gestion documentaire sécurisé')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('auth', 'Authentification et MFA')
    .addTag('chartes', 'Chartes obligatoires PDF (A.6.2)')
    .addTag('documents', 'GED — Gestion documentaire (A.5.1)')
    .addTag('veille', 'Veille cybersécurité CERT-FR/ANSSI (A.5.7)')
    .addTag('external-access', 'Portail prestataires (A.5.19)')
    .addTag('tickets', 'Helpdesk IT')
    .addTag('audit', 'Journal d\'audit (A.5.36)')
    .addTag('incidents', 'Gestion des incidents (A.5.24)')
    .addTag('it-exports', 'Exports IT & Conformite (A.8.13)')
    .addTag('access-reviews', 'Revue des acces (A.5.18)')
    .addTag('calendar', 'Calendrier & evenements')
    .addTag('office', 'OnlyOffice Docs')
    .addTag('stirling', 'Stirling PDF')
    .addTag('data-retention', 'Politique de retention (A.5.33)')
    .addTag('spaces', 'Espaces & modules')
    .addTag('push', 'Notifications push (VAPID)')
    .addTag('saved-filters', 'Filtres sauvegardes')
    .build();
  const swaggerDoc = SwaggerModule.createDocument(app, swaggerConfig);
  // Swagger uniquement hors production (ANSSI R1 : ne pas exposer la doc API)
  if (!isProduction) {
    SwaggerModule.setup('api/v1/docs', app, swaggerDoc);
    logger.log('Swagger UI available at /api/v1/docs (dev only)');
  }

  const port = process.env.PORT || 3000;
  const host = process.env.HOST || '0.0.0.0';
  await app.listen(port, host);
  logger.log(`OMNITECH Intranet API running on ${host}:${port}`);
}

bootstrap();
