// ============================================================
// PIK — Persistent Identity Kernel
// PrismaService (Sprint 3 — Resilient Connections)
//
// Handles Railway sleep/wake gracefully. When the container
// wakes up after sleeping, Prisma auto-reconnects on the next
// query. We add explicit connection health logging.
//
// Place at: src/prisma.service.ts
// ============================================================

import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log:
        process.env.NODE_ENV === 'production'
          ? ['error', 'warn']
          : ['query', 'error', 'warn'],
      // Prisma's built-in connection pool handles reconnection.
      // These datasource settings optimize for Railway's environment:
      datasourceUrl: process.env.DATABASE_URL,
    });
  }

  async onModuleInit(): Promise<void> {
    // Retry connection up to 3 times on startup (handles Railway cold starts)
    let lastError: Error | undefined;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await this.$connect();
        this.logger.log('Connected to PostgreSQL');
        return;
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(
          `Connection attempt ${attempt}/3 failed: ${lastError.message}`,
        );
        if (attempt < 3) {
          await new Promise((r) => setTimeout(r, 2000 * attempt));
        }
      }
    }
    this.logger.error('Failed to connect to PostgreSQL after 3 attempts');
    throw lastError;
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Disconnected from PostgreSQL');
  }

  /**
   * Clean up expired WebAuthn challenges and session tokens.
   * Called at startup and every 15 minutes by main.ts.
   */
  async cleanupExpired(): Promise<{ challenges: number; tokens: number }> {
    const now = new Date();

    try {
      const [challengeResult, tokenResult] = await this.$transaction([
        this.webAuthnChallenge.deleteMany({
          where: { expiresAt: { lt: now } },
        }),
        this.sessionToken.deleteMany({
          where: { expiresAt: { lt: now } },
        }),
      ]);

      if (challengeResult.count > 0 || tokenResult.count > 0) {
        this.logger.log(
          `Cleanup: removed ${challengeResult.count} expired challenges, ${tokenResult.count} expired tokens`,
        );
      }

      return {
        challenges: challengeResult.count,
        tokens: tokenResult.count,
      };
    } catch (error) {
      // Non-fatal — log and continue
      this.logger.warn(
        'Cleanup failed (will retry): ' + (error as Error).message,
      );
      return { challenges: 0, tokens: 0 };
    }
  }
}
