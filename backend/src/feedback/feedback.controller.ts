// ============================================================
// FeedbackController — closed-alpha reports (2026-07-31)
// Routes: /api/feedback
//
// POST is deliberately UNGUARDED: a tester whose session broke
// still has to be able to tell us. It is throttled by the global
// ThrottlerGuard and validated in the service. Reads/writes for
// triage sit behind PlatformAdminGuard (fail-closed).
// ============================================================

import {
  Controller, Post, Get, Patch, Body, Query, Param, UseGuards,
} from '@nestjs/common';
import { FeedbackService, type SubmitFeedbackDto } from './feedback.service';
import { PlatformAdminGuard } from '../auth/guards/platform-admin.guard';

@Controller('api/feedback')
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  /** POST /api/feedback — a tester's report. Open by design. */
  @Post()
  async submit(@Body() body: SubmitFeedbackDto) {
    return this.feedback.submit(body ?? {});
  }

  /** GET /api/feedback?status=&kind=&limit= — triage queue. */
  @Get()
  @UseGuards(PlatformAdminGuard)
  async list(
    @Query('status') status?: string,
    @Query('kind') kind?: string,
    @Query('limit') limit?: string,
  ) {
    return this.feedback.list({
      status, kind,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  /** PATCH /api/feedback/:id — new | triaged | closed. */
  @Patch(':id')
  @UseGuards(PlatformAdminGuard)
  async setStatus(@Param('id') id: string, @Body() body: { status: string }) {
    return this.feedback.setStatus(id, body?.status);
  }
}
