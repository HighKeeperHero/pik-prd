// ============================================================
// PIK — SSE Service (Sprint 6 — Track A)
//
// Central EventEmitter for Server-Sent Events. Any service can
// push events here; connected SSE clients receive them in
// real time. Used by the investor demo and operator dashboard.
//
// Place at: src/sse/sse.service.ts
// ============================================================

import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter } from 'events';

export interface SSEPayload {
  type: string;
  data: Record<string, unknown>;
  timestamp: string;
}

@Injectable()
export class SseService {
  private readonly logger = new Logger(SseService.name);
  private readonly emitter = new EventEmitter();
  private clientCount = 0;

  constructor() {
    // Allow many concurrent SSE listeners
    this.emitter.setMaxListeners(200);
  }

  /**
   * Subscribe to the event stream. Returns a cleanup function.
   */
  subscribe(listener: (payload: SSEPayload) => void): () => void {
    this.emitter.on('event', listener);
    this.clientCount++;
    this.logger.debug(`SSE client connected (${this.clientCount} total)`);

    return () => {
      this.emitter.off('event', listener);
      this.clientCount--;
      this.logger.debug(`SSE client disconnected (${this.clientCount} total)`);
    };
  }

  /**
   * Broadcast an event to all connected SSE clients.
   */
  emit(type: string, data: Record<string, unknown>): void {
    const payload: SSEPayload = {
      type,
      data,
      timestamp: new Date().toISOString(),
    };
    this.emitter.emit('event', payload);
  }

  getClientCount(): number {
    return this.clientCount;
  }
}
