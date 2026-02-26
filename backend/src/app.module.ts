// ============================================================
// PIK — Persistent Identity Kernel
// Root Application Module (COMPLETE — all modules enabled)
//
// This is the full PIK v1 backend:
//   - Identity kernel (enrollment, profiles, timelines)
//   - Consent engine (source links, consent receipts)
//   - Progression ingest (XP, titles, fate markers)
//   - Config tuning + analytics
//   - WebAuthn authentication (passkeys, key rotation/revocation)
//
// Place at: src/app.module.ts
// ============================================================

import { Module, Global } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';

import { PrismaService } from './prisma.service';
import { EventsModule } from './events/events.module';
import { IdentityModule } from './identity/identity.module';
import { ConsentModule } from './consent/consent.module';
import { IngestModule } from './ingest/ingest.module';
import { ConfigModule } from './config/config.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AuthModule } from './auth/auth.module';

@Global()
@Module({
  imports: [
    // Serve dashboard.html at the root URL (GET /)
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
      serveRoot: '/',
      exclude: ['/api/(.*)'],
    }),

    // All feature modules
    EventsModule,
    IdentityModule,
    ConsentModule,
    IngestModule,
    ConfigModule,
    AnalyticsModule,
    AuthModule,
  ],

  providers: [PrismaService],
  exports: [PrismaService],
})
export class AppModule {}
