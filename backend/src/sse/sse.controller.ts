// ============================================================
// PIK — SSE Controller (Sprint 6 — Track A)
//
// GET /api/events/stream — Server-Sent Events endpoint.
// Clients connect and receive real-time identity events.
//
// Place at: src/sse/sse.controller.ts
// ============================================================

import { Controller, Get, Res, Req } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Response, Request } from 'express';
import { SseService, SSEPayload } from './sse.service';

@Controller('api/events')
export class SseController {
  constructor(private readonly sse: SseService) {}

  /**
   * GET /api/events/stream
   *
   * Opens a persistent SSE connection. The client receives
   * newline-delimited JSON events as they occur.
   *
   * Event format:
   *   event: <type>
   *   data: <json>
   *
   * Includes a heartbeat every 30s to keep the connection alive.
   */
  @Get('stream')
  @SkipThrottle()
  stream(@Req() req: Request, @Res() res: Response) {
    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    res.flushHeaders();

    // Send initial connection event
    res.write(`event: connected\ndata: ${JSON.stringify({ 
      clients: this.sse.getClientCount() + 1,
      timestamp: new Date().toISOString(),
    })}\n\n`);

    // Subscribe to events
    const listener = (payload: SSEPayload) => {
      res.write(`event: ${payload.type}\ndata: ${JSON.stringify(payload)}\n\n`);
    };
    const unsubscribe = this.sse.subscribe(listener);

    // Heartbeat every 30 seconds
    const heartbeat = setInterval(() => {
      res.write(`: heartbeat ${new Date().toISOString()}\n\n`);
    }, 30_000);

    // Cleanup on disconnect
    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  }
}
