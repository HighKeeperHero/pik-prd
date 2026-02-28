// ============================================================
// PIK — Persistent Identity Kernel
// Root Application Module (Sprint 3 — Hardened)
//
// Added: ThrottlerModule for rate limiting
//
// Place at: src/app.module.ts
// ============================================================
import { Module, Global } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { join } from 'path';
import { PrismaService } from './prisma.service';
import { EventsModule } from './events/events.module';
import { IdentityModule } from './identity/identity.module';
import { ConsentModule } from './consent/consent.module';
import { IngestModule } from './ingest/ingest.module';
import { ConfigModule } from './config/config.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AuthModule } from './auth/auth.module';
import { SseModule } from './sse/sse.module';
import { DemoModule } from './demo/demo.module';

@Global()
@Module({
  imports: [
    // ── Rate Limiting ───────────────────────────────────
    // Global default: 60 requests per 60 seconds per IP.
    // Individual controllers can override with @Throttle()
    // or skip with @SkipThrottle().
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000, // 60 seconds
        limit: 60,  // 60 requests per window
      },
    ]),

    // Serve dashboard at root URL
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
      serveRoot: '/',
      exclude: ['/api/(.*)'],
    }),

    // Feature modules
    EventsModule,
    IdentityModule,
    ConsentModule,
    IngestModule,
    ConfigModule,
    AnalyticsModule,
    AuthModule,
    SseModule,
    DemoModule,
  ],
  providers: [
    PrismaService,
    // Apply ThrottlerGuard globally — every route gets rate limiting
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
  exports: [PrismaService],
})
export class AppModule {}
