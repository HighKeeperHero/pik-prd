// ============================================================
// PIK — Persistent Identity Kernel
// PrismaService — Injectable database client for NestJS
//
// This is the single point of database access for the entire
// application. Every module injects PrismaService rather than
// instantiating its own PrismaClient.
//
// Place this file at: src/prisma.service.ts
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
      // Log slow queries and errors in development.
      // In production, Railway sets NODE_ENV=production automatically.
      log:
        process.env.NODE_ENV === 'production'
          ? ['error', 'warn']
          : ['query', 'error', 'warn'],
    });
  }

  /**
   * Connect to PostgreSQL when the NestJS module initializes.
   * This runs automatically — no manual connection management needed.
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.logger.log('Connected to PostgreSQL');
    } catch (error) {
      this.logger.error('Failed to connect to PostgreSQL', error);
      throw error;
    }
  }

  /**
   * Gracefully disconnect when the application shuts down.
   * Ensures connections are returned to the pool on SIGTERM (Railway deploys).
   */
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Disconnected from PostgreSQL');
  }

  /**
   * Clean up expired WebAuthn challenges and session tokens.
   * Call this on a schedule (e.g., every 15 minutes) or at startup.
   *
   * Not strictly required — expired records are ignored by the auth
   * service — but keeps the tables lean in production.
   */
  async cleanupExpired(): Promise<{ challenges: number; tokens: number }> {
    const now = new Date();

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
  }
}
