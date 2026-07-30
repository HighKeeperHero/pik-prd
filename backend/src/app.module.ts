// ============================================================
// PIK — Persistent Identity Kernel
// Root Application Module
// Sprint 13: VeilModule added
// ============================================================
import { Module, Global } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerModule, ThrottlerGuard, SkipThrottle } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { join } from 'path';

import { PrismaService }     from './prisma.service';
import { describeEnvironment } from './common/environment';
import { EventsModule }      from './events/events.module';
import { IdentityModule }    from './identity/identity.module';
import { ConsentModule }     from './consent/consent.module';
import { IngestModule }      from './ingest/ingest.module';
import { PartnerModule }     from './partner/partner.module';   // HEP Phase 2 Slice 1
import { PortalModule }      from './portal/portal.module';     // HEP Phase 2 Slice 2
import { ConfigModule }      from './config/config.module';
import { AnalyticsModule }   from './analytics/analytics.module';
import { AuthModule }        from './auth/auth.module';
import { SseModule }         from './sse/sse.module';
import { DemoModule }        from './demo/demo.module';
import { LootModule }        from './loot/loot.module';
import { GearModule }        from './gear/gear.module';
import { SessionModule }     from './session/session.module';
import { WearableModule }    from './wearable/wearable.module';
import { QuestModule }       from './quest/quest.module';
import { LeaderboardModule } from './leaderboard/leaderboard.module';
import { FateAccountModule } from './fate-account/fate-account.module';
import { TrainingModule }    from './training/training.module';
import { TitlesModule }      from './titles/titles.module';
import { WorkshopModule }    from './workshop/workshop.module';
import { VeilModule }        from './veil/veil.module';       // ← Sprint 13
import { VenturesModule }    from './quest/ventures.module';   // ← Sprint 20.3
import { WarbandModule }     from './warband/warband.module';    // ← Sprint 23
import { LandmarkModule }   from './landmark/landmark.module';  // ← Sprint 25
import { SanctumModule }    from './sanctum/sanctum.module';     // ← Sprint 28 (iOS daily ritual)
import { PushModule }       from './push/push.module';            // ← Sprint 28 (iOS push token register)
import { IapModule }        from './iap/iap.module';              // ← Sprint 28 (iOS StoreKit 2 redeem)
import { LevelingModule }   from './leveling/leveling.module';    // ← Phase 2 Arc A (hero XP curve)
import { JobModule }        from './job/job.module';              // ← Phase 3a (JobXP track + ranks)
import { DoctrineModule }   from './doctrine/doctrine.module';    // ← Phase 4 (Job-gated doctrine trees)
import { EchoModule }       from './echo/echo.module';            // ← Hero Echoes (Altar registration)
import { VocationModule }   from './vocation/vocation.module';    // ← Phase 5 (advisory Job recommendation)
import { RelicMarksModule } from './relic-marks/relic-marks.module'; // ← Sprint 31 (XR interop seam: USDZ assets)
import { MemoriaModule }    from './memoria/memoria.module';          // ← Sprint 32 (Tier 2 identity-collection)
import { LoreModule }       from './lore/lore.module';                // ← 2026-07-06 Lore Archive collection
import { FlagsModule }      from './flags/flags.module';              // ← 2026-07-09 alpha release pipeline
import { FoxModule }        from './fox/fox.module';                  // ← 2026-07-09 Fate Fox Calling (L50)
import { SpatialModule }    from './spatial/spatial.module';         // ← HEP Phase 2 Slice 4 (room calibration)
import { SupportModule }    from './support/support.module';          // ← HEP Phase 2 Slice 8 (venue support console)
import { LinksModule }      from './links/links.module';              // ← HEP (scannable https QR targets)
import { CertificationModule } from './certification/certification.module'; // ← HEP Phase 2 Slice 9 (venue certification)
import { MailModule }       from './mail/mail.module';                // ← HEP Phase 2 (venue staff password reset + invites)

import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';

@Controller('api')
class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  // Liveness — process is up. Fast, dependency-free (a DB blip must not
  // restart the app). Point Railway's healthcheck path here.
  // `environment` is reported so a caller can tell staging from production
  // without guessing from the hostname — the two were indistinguishable
  // from the outside until Phase 2.
  @Get('health')
  @SkipThrottle()
  health() {
    return {
      status: 'ok',
      ...describeEnvironment(),
      timestamp: new Date().toISOString(),
    };
  }

  // Readiness — verifies the DB is reachable. Point an external uptime
  // monitor (UptimeRobot/BetterStack) here to catch DB outages too.
  @Get('health/ready')
  @SkipThrottle()
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        status: 'ok',
        db: 'ok',
        ...describeEnvironment(),
        timestamp: new Date().toISOString(),
      };
    } catch {
      // 503 so a status-code uptime monitor catches DB outages, not just
      // process-down.
      throw new ServiceUnavailableException({
        status: 'degraded', db: 'down', timestamp: new Date().toISOString(),
      });
    }
  }
}

@Global()
@Module({
  imports: [
    // ── Rate Limiting ──────────────────────────────────────────────────────────
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60000, limit: 60 },
    ]),

    // ── Static Dashboard ───────────────────────────────────────────────────────
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
      serveRoot: '/',
      exclude: ['/api/(.*)'],
      serveStaticOptions: {
        setHeaders: (res, path) => {
          if (path.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
          }
        },
      },
    }),

    // ── Feature Modules ────────────────────────────────────────────────────────
    TrainingModule,
    TitlesModule,
    EventsModule,
    IdentityModule,
    ConsentModule,
    IngestModule,
    PartnerModule,
    PortalModule,
    ConfigModule,
    AnalyticsModule,
    AuthModule,
    SseModule,
    DemoModule,
    LootModule,
    GearModule,
    SessionModule,
    WearableModule,
    QuestModule,
    LeaderboardModule,
    FateAccountModule,
    WorkshopModule,
    VeilModule,           // ← Sprint 13
    VenturesModule,       // ← Sprint 20.3
    WarbandModule,        // ← Sprint 23
    LandmarkModule,       // ← Sprint 25
    SanctumModule,        // ← Sprint 28 (iOS daily ritual)
    PushModule,           // ← Sprint 28 (iOS push token register)
    IapModule,            // ← Sprint 28 (iOS StoreKit 2 redeem)
    LevelingModule,       // ← Phase 2 Arc A (hero XP curve)
    JobModule,            // ← Phase 3a (JobXP track + ranks)
    DoctrineModule,       // ← Phase 4 (Job-gated doctrine trees)
    EchoModule,           // ← Hero Echoes (Altar registration)
    VocationModule,       // ← Phase 5 (advisory Job recommendation)
    RelicMarksModule,     // ← Sprint 31 (XR interop seam: USDZ assets)
    MemoriaModule,        // ← Sprint 32 (Tier 2 identity-collection)
    LoreModule,           // ← 2026-07-06 Lore Archive collection
    FlagsModule,          // ← 2026-07-09 alpha release pipeline
    FoxModule,            // ← 2026-07-09 Fate Fox Calling (L50)
    MailModule,           // ← HEP Phase 2 (global: reset + invite delivery)
    SpatialModule,        // ← HEP Phase 2 Slice 4 (spatial data model)
    SupportModule,        // ← HEP Phase 2 Slice 8 (support console, read-only)
    LinksModule,          // ← HEP (/v/:id and /t/:token — what QRs encode)
    CertificationModule,  // ← HEP Phase 2 Slice 9 (certification gate)
  ],
  controllers: [HealthController],
  providers: [
    PrismaService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
  exports: [PrismaService],
})
export class AppModule {}
