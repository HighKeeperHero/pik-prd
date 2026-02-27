// ============================================================
// PIK — Ingest Controller (Sprint 3 — Rate Limited)
// Route: POST /api/ingest
//
// Rate limit: 120/min per IP (game servers send bursts)
//
// Place at: src/ingest/ingest.controller.ts
// ============================================================
import { Controller, Post, Body, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IngestService } from './ingest.service';
import { IngestEventDto } from './dto/ingest-event.dto';
import { ApiKeyGuard, ResolvedSource } from '../auth/guards/api-key.guard';

@Controller('api/ingest')
export class IngestController {
  constructor(private readonly ingestService: IngestService) {}

  @Post()
  @UseGuards(ApiKeyGuard)
  @Throttle({ default: { ttl: 60000, limit: 120 } })
  async ingest(
    @Body() dto: IngestEventDto,
    @Req() request: Request & { source: ResolvedSource },
  ) {
    return this.ingestService.ingest(dto, request.source);
  }
}
