// ============================================================
// PIK — Persistent Identity Kernel
// Application Bootstrap (Sprint 3 — Hardened)
// Place at: src/main.ts
// ============================================================
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { PrismaService } from './prisma.service';

async function bootstrap() {
  const logger = new Logger('PIK');
  const app = await NestFactory.create(AppModule);

  // ── Security Headers ────────────────────────────────────
  // Helmet sets X-Frame-Options, X-Content-Type-Options,
  // Strict-Transport-Security, etc.
  app.use(
    helmet({
      contentSecurityPolicy: false, // Dashboard uses inline scripts
      crossOriginEmbedderPolicy: false, // Allow CDN resources
    }),
  );

  // ── CORS ────────────────────────────────────────────────
  // Production: lock to Railway domain only
  // Development: allow all origins for local testing
  const isProd = process.env.NODE_ENV === 'production';
  const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim())
    : [];

  app.enableCors({
    origin: isProd
      ? (origin, callback) => {
          // Allow same-origin (no origin header) + configured origins
          if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
          } else {
            logger.warn(`CORS blocked: ${origin}`);
            callback(null, false);
          }
        }
      : true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-PIK-API-Key'],
    credentials: true,
  });

  // ── Validation ──────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());

  // ── Startup Cleanup ─────────────────────────────────────
  // Remove expired challenges and tokens left from previous runs
  const prisma = app.get(PrismaService);
  await prisma.cleanupExpired();

  // Schedule cleanup every 15 minutes
  setInterval(
    async () => {
      try {
        await prisma.cleanupExpired();
      } catch (e) {
        logger.warn('Cleanup error (non-fatal): ' + (e as Error).message);
      }
    },
    15 * 60 * 1000,
  );

  const port = parseInt(process.env.PORT ?? '8080', 10);
  await app.listen(port);

  logger.log('');
  logger.log('PIK — Persistent Identity Kernel');
  logger.log(`API running at    http://localhost:${port}`);
  logger.log(`Dashboard at      http://localhost:${port}/`);
  logger.log(`Environment       ${process.env.NODE_ENV || 'development'}`);
  logger.log(`CORS              ${isProd ? allowedOrigins.join(', ') || 'same-origin only' : 'open (dev)'}`);
  logger.log(`Rate limiting     enabled`);
  logger.log('');
  logger.log('Press Ctrl+C to stop.');
}
bootstrap();
