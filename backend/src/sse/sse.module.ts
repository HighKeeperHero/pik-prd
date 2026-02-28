// ============================================================
// PIK — SSE Module (Sprint 6 — Track A)
// Place at: src/sse/sse.module.ts
// ============================================================

import { Module, Global } from '@nestjs/common';
import { SseService } from './sse.service';
import { SseController } from './sse.controller';

@Global()
@Module({
  controllers: [SseController],
  providers: [SseService],
  exports: [SseService],
})
export class SseModule {}
