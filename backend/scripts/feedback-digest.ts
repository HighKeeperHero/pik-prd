// ============================================================
// feedback-digest.ts — run the daily digest by hand.
//
// The scheduled job lives in the API (FeedbackDigestService, 14:00
// UTC daily). This is the same code path on demand: for proving the
// mail before trusting the cron, and for catching up after an outage.
//
//   npm run feedback:digest              # last 24h
//   npm run feedback:digest -- --hours=168
//
// Built by hand rather than through AppModule on purpose — booting the
// full graph drags in providers this has no business needing (and
// jwks-rsa's CJS interop trips under tsx). The digest needs Prisma and
// Mail; it gets exactly those.
//
// Honours FEEDBACK_DIGEST_TO and RESEND_API_KEY exactly as the cron
// does — no key means the message goes to the log, which is the
// intended way to preview it.
// ============================================================

import { PrismaClient } from '@prisma/client';
import { MailService } from '../src/mail/mail.service';
import { FeedbackDigestService } from '../src/feedback/feedback.digest';

async function main() {
  const hoursArg = process.argv.find(a => a.startsWith('--hours='))?.split('=')[1];
  const hours = hoursArg ? parseInt(hoursArg, 10) : 24;

  const prisma = new PrismaClient();
  const mail = new MailService();
  const digest = new FeedbackDigestService(prisma as never, mail);

  try {
    const res = await digest.sendDigest(hours);
    console.log('\n' + JSON.stringify(res, null, 2));
    if (!res.sent && res.reason) console.log(`\nNot sent: ${res.reason}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
