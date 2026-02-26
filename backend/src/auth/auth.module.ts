// ============================================================
// PIK — Auth Module
//
// WebAuthn registration, authentication, key management,
// and session tokens. Exports AuthService and guards so
// other modules can use them.
//
// Place at: src/auth/auth.module.ts
// ============================================================

import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { KeyService } from './key.service';
import { SessionGuard } from './guards/session.guard';
import { ApiKeyGuard } from './guards/api-key.guard';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [EventsModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    KeyService,
    SessionGuard,
    ApiKeyGuard,
  ],
  exports: [
    AuthService,     // SessionGuard and other modules need token validation
    KeyService,
    SessionGuard,
    ApiKeyGuard,     // IngestModule uses this guard
  ],
})
export class AuthModule {}
