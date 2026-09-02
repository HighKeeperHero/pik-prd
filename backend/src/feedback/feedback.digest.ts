// ============================================================
// FeedbackDigest — one mail a day with what the testers said.
//
// WHY: on 2026-08-11 testers reported that bug reports "never
// reached us". Every one had arrived and was sitting in the table
// marked `new`, the oldest five days old. The submit path was never
// broken — nothing surfaced it. Two of those reports named bugs we
// later spent time rediscovering ourselves.
//
// So the inbox pushes now. Once a day, if anything arrived, it goes
// to FEEDBACK_DIGEST_TO through the existing Resend seam (which
// falls back to the server log when no API key is set, so this is
// safe to ship before the address is configured).
//
// Deliberately quiet: no reports in the window, no mail. A digest
// that arrives every day saying "nothing" gets filtered, and then
// the day it matters it gets filtered too.
// ============================================================

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma.service';
import { MailService } from '../mail/mail.service';

/** 14:00 UTC — early morning in US Pacific, where this gets read. */
const DIGEST_CRON = '0 14 * * *';
const WINDOW_HOURS = 24;

const KIND_LABEL: Record<string, string> = {
  bug: 'BUG', idea: 'IDEA', praise: 'PRAISE', other: 'NOTE',
};

@Injectable()
export class FeedbackDigestService {
  private readonly logger = new Logger(FeedbackDigestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  @Cron(DIGEST_CRON)
  async scheduled(): Promise<void> {
    await this.sendDigest().catch(e =>
      this.logger.error(`Digest failed: ${(e as Error).message}`));
  }

  /** Build and send. Returns what happened, so a manual run can say. */
  async sendDigest(windowHours = WINDOW_HOURS): Promise<{
    sent: boolean; reason?: string; count: number; open: number;
  }> {
    const since = new Date(Date.now() - windowHours * 3_600_000);

    const [fresh, open] = await Promise.all([
      this.prisma.feedback.findMany({
        where: { createdAt: { gte: since } },
        orderBy: { createdAt: 'asc' },
        include: { root: { select: { heroName: true, fateLevel: true } } },
      }),
      this.prisma.feedback.count({ where: { status: 'new' } }),
    ]);

    if (fresh.length === 0) {
      this.logger.log(`Digest: nothing in the last ${windowHours}h (${open} still open) — not sending.`);
      return { sent: false, reason: 'no reports in window', count: 0, open };
    }

    const to = process.env.FEEDBACK_DIGEST_TO;
    if (!to) {
      this.logger.warn(
        `Digest: ${fresh.length} report(s) but FEEDBACK_DIGEST_TO is unset — nothing sent.`,
      );
      return { sent: false, reason: 'FEEDBACK_DIGEST_TO unset', count: fresh.length, open };
    }

    const bugs = fresh.filter(r => r.kind === 'bug').length;
    const subject =
      `Codex testers — ${fresh.length} report${fresh.length === 1 ? '' : 's'}` +
      `${bugs ? `, ${bugs} bug${bugs === 1 ? '' : 's'}` : ''}`;

    const lines: string[] = [];
    const html: string[] = [];
    html.push(`<p style="font:14px system-ui;color:#444">`
      + `${fresh.length} new in the last ${windowHours}h · ${open} still open</p>`);

    for (const r of fresh) {
      const c = (r.context ?? {}) as Record<string, string>;
      const who = r.root?.heroName ?? c.hero_name ?? 'unattributed';
      const when = r.createdAt.toISOString().slice(0, 16).replace('T', ' ');
      const build = `${c.platform ?? '?'} ${c.os_version ?? ''} · ${c.device ?? '?'} · ${c.channel ?? '?'} v${c.app_version ?? '?'}`;
      const head = `[${KIND_LABEL[r.kind] ?? r.kind}] ${when} — ${who}`;

      lines.push('─'.repeat(60), head, `  ${build}`, `  id ${r.id}`, '', r.message, '');
      html.push(
        `<div style="margin:18px 0;padding:12px 14px;border-left:3px solid ${
          r.kind === 'bug' ? '#c0392b' : r.kind === 'idea' ? '#2c7fb8' : '#7a8b3a'
        };background:#fafafa">`
        + `<div style="font:600 13px system-ui">${escapeHtml(head)}</div>`
        + `<div style="font:12px system-ui;color:#777;margin:2px 0 8px">${escapeHtml(build)}</div>`
        + `<div style="font:14px/1.5 system-ui;white-space:pre-wrap">${escapeHtml(r.message)}</div>`
        + `<div style="font:11px monospace;color:#999;margin-top:8px">${r.id}</div>`
        + `</div>`,
      );
    }

    lines.push('─'.repeat(60), `${open} report(s) still marked new.`,
      'Triage: npm run feedback -- --triage <id> | --close <id>');
    html.push(`<p style="font:12px system-ui;color:#777">${open} still marked new. `
      + `Triage with <code>npm run feedback</code>.</p>`);

    const res = await this.mail.send({
      to,
      subject,
      text: lines.join('\n'),
      html: html.join('\n'),
      kind: 'feedback_digest',
    });

    this.logger.log(
      `Digest sent (${res.transport}): ${fresh.length} report(s), ${open} open → ${to}`,
    );
    return { sent: res.delivered, count: fresh.length, open };
  }
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
