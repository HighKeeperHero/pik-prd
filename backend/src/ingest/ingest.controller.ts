// ============================================================
// PIK — Ingest Controller
// Route: POST /api/ingest
//
// Protected by ApiKeyGuard — requires a valid X-PIK-API-Key
// header matching a registered source. The guard attaches the
// resolved source to the request object.
//
// Place at: src/ingest/ingest.controller.ts
// ============================================================

import {
  Controller,
  Post,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IngestService } from './ingest.service';
import { IngestEventDto } from './dto/ingest-event.dto';
import { ApiKeyGuard, ResolvedSource } from '../auth/guards/api-key.guard';

@Controller('api/ingest')
export class IngestController {
  constructor(private readonly ingestService: IngestService) {}

  /**
   * POST /api/ingest
   *
   * Ingest a progression event from an authenticated source.
   *
   * Headers:
   *   X-PIK-API-Key: <source API key>
   *
   * MVP contract preserved:
   *   Request:  { root_id, event_type, payload }
   *   Response: { event_id, event_type, changes_applied }
   *   Errors:   { status: "error", message: "..." } with 403 for invalid key or no consent
   */
  @Post()
  @UseGuards(ApiKeyGuard)
  async ingest(
    @Body() dto: IngestEventDto,
    @Req() request: Request & { source: ResolvedSource },
  ) {
    return this.ingestService.ingest(dto, request.source);
  }
}
