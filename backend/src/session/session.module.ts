// ============================================================
// PIK — Session Module (Sprint 7.1 — Live Sessions)
// Place at: src/session/session.module.ts
// ============================================================

import { Module } from '@nestjs/common';
import { SessionService } from './session.service';
import { SessionController } from './session.controller';
import { EventsModule } from '../events/events.module';
import { SseModule } from '../sse/sse.module';
import { PlatformAdminGuard } from '../auth/guards/platform-admin.guard';

@Module({
  imports: [EventsModule, SseModule],
  controllers: [SessionController],
  providers: [SessionService, PlatformAdminGuard],
  exports: [SessionService],
})
export class SessionModule {}
