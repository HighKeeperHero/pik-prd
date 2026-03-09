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
import { AccountGuard } from './guards/account.guard';
import { EventsModule } from '../events/events.module';
import { FateAccountModule } from '../fate-account/fate-account.module';

@Module({
  imports: [EventsModule, FateAccountModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    KeyService,
    SessionGuard,
    ApiKeyGuard,
    AccountGuard,
  ],
  exports: [
    AuthService,     // SessionGuard and other modules need token validation
    KeyService,
    SessionGuard,
    ApiKeyGuard,     // IngestModule uses this guard
    AccountGuard,    // LootModule, GearModule, TitlesController need this
  ],
})
export class AuthModule {}
