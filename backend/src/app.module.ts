// ============================================================
// PIK — Persistent Identity Kernel
// Root Application Module
// Sprint 13: VeilModule added
// ============================================================
import { Module, Global } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { join } from 'path';

import { PrismaService }     from './prisma.service';
import { EventsModule }      from './events/events.module';
import { IdentityModule }    from './identity/identity.module';
import { ConsentModule }     from './consent/consent.module';
import { IngestModule }      from './ingest/ingest.module';
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

import { Controller, Get } from '@nestjs/common';

@Controller('api')
class HealthController {
  @Get('health')
  health() { return { status: 'ok', timestamp: new Date().toISOString() }; }
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
  ],
  controllers: [HealthController],
  providers: [
    PrismaService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
  exports: [PrismaService],
})
export class AppModule {}
