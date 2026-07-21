// ============================================================
// HEP Phase 2 — Mail module
//
// Global: password reset lives in the portal today, but guest claim
// delivery and platform operator notices will want the same service,
// and none of them should have to re-import it.
//
// Place at: src/mail/mail.module.ts
// ============================================================

import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';

@Global()
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
