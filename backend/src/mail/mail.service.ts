// ============================================================
// HEP Phase 2 — Mail
//
// The seam that removes the last piece of per-venue custom engineering:
// a venue owner who forgets their password can recover without a Heroes
// engineer. Password reset and staff-invite delivery are the same seam,
// so they are built together.
//
// ── Provider ──────────────────────────────────────────────────
// Resend, called over plain fetch. Deliberately NO SDK dependency: the
// send is one POST with a JSON body, and a dependency here would be
// three transitive trees and a lockfile change for that. Swapping to
// Postmark/SES means rewriting one private method.
//
// ── Transports ────────────────────────────────────────────────
//   resend  — RESEND_API_KEY is set. Real delivery.
//   log     — no key. Writes the message (INCLUDING the link) to the
//             server log and retains it in a small in-memory outbox.
//
// The `log` transport is what makes this shippable before the key
// lands: every code path downstream of MailService is identical either
// way, so nothing is left untested waiting on a credential. A venue
// provisioned in this state still recovers — the owner's link is in the
// deploy log, which is exactly today's hand-carry, no worse.
//
// Place at: src/mail/mail.service.ts
// ============================================================

import { Injectable, Logger } from '@nestjs/common';

export type MailTransport = 'resend' | 'log';

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Coarse label for the outbox and logs — never the token. */
  kind: string;
}

export interface SentMail extends MailMessage {
  at: string;
  transport: MailTransport;
}

/**
 * How many messages the log transport retains.
 *
 * Small on purpose. This is a development affordance for asserting that
 * a mail was produced, not a mail archive — and it holds live reset
 * links in memory, so it should forget quickly.
 */
const OUTBOX_LIMIT = 25;

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly outbox: SentMail[] = [];

  private readonly apiKey = process.env.RESEND_API_KEY?.trim() || null;
  private readonly from =
    process.env.MAIL_FROM?.trim() || 'Heroes Veritas <noreply@heroesveritas.com>';

  readonly transport: MailTransport = this.apiKey ? 'resend' : 'log';

  constructor() {
    if (this.transport === 'log') {
      this.logger.warn(
        'RESEND_API_KEY is not set — mail runs in `log` transport. Password ' +
          'reset and staff invite links will appear in this log instead of ' +
          "being delivered. Set the key in Railway to enable real delivery.",
      );
    } else {
      this.logger.log(`Mail transport: resend (from: ${this.from})`);
    }
  }

  /**
   * Send, and say whether it left the building.
   *
   * Never throws. A failed invite email must not roll back the invite —
   * the token is still valid and still hand-carryable, and losing the
   * staff row because SMTP hiccuped would be the worse outcome. Callers
   * get `delivered` and decide what to tell the operator.
   */
  async send(msg: MailMessage): Promise<{ delivered: boolean; transport: MailTransport }> {
    const record: SentMail = {
      ...msg,
      at: new Date().toISOString(),
      transport: this.transport,
    };

    if (this.transport === 'log') {
      this.outbox.push(record);
      if (this.outbox.length > OUTBOX_LIMIT) this.outbox.shift();
      this.logger.log(
        `[mail:log] to=${msg.to} kind=${msg.kind} subject="${msg.subject}"\n` +
          msg.text,
      );
      // Honest: nothing was delivered. A caller that reports "sent" off
      // the back of this would be lying to the operator.
      return { delivered: false, transport: 'log' };
    }

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.from,
          to: [msg.to],
          subject: msg.subject,
          html: msg.html,
          text: msg.text,
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '<unreadable>');
        // Log the failure, never the message body — it holds the token.
        this.logger.error(
          `Mail send failed (${res.status}) to=${redact(msg.to)} kind=${msg.kind}: ${body}`,
        );
        return { delivered: false, transport: 'resend' };
      }

      this.logger.log(`Mail sent to=${redact(msg.to)} kind=${msg.kind}`);
      return { delivered: true, transport: 'resend' };
    } catch (err) {
      this.logger.error(
        `Mail send threw for to=${redact(msg.to)} kind=${msg.kind}: ${String(err)}`,
      );
      return { delivered: false, transport: 'resend' };
    }
  }

  /**
   * The log transport's outbox.
   *
   * Returns empty when a real provider is configured — there is nothing
   * to catch, and this must never become a way to read live mail in an
   * environment that actually sends it. The route on top of this is
   * additionally platform-admin gated.
   */
  readOutbox(): SentMail[] {
    if (this.transport !== 'log') return [];
    return [...this.outbox];
  }

  // ────────────────────────────────────────────────────────────
  // TEMPLATES
  //
  // Plain and unbranded on purpose. These are operational mail to a
  // venue's staff — a business tool, not the game's voice. Heroes'
  // mythic register belongs in the app; an operator resetting a
  // password at 11pm wants a legible sentence and a button.
  // ────────────────────────────────────────────────────────────

  passwordReset(params: { to: string; venueName: string; link: string; ttlMinutes: number }) {
    const { to, venueName, link, ttlMinutes } = params;
    return this.send({
      to,
      kind: 'portal.password_reset',
      subject: `Reset your ${venueName} portal password`,
      text:
        `A password reset was requested for your staff account at ${venueName}.\n\n` +
        `Open this link to choose a new password:\n${link}\n\n` +
        `The link expires in ${ttlMinutes} minutes and can be used once.\n\n` +
        `If you did not request this, you can ignore this message — your ` +
        `password has not changed.\n`,
      html: layout(
        `Reset your portal password`,
        `<p>A password reset was requested for your staff account at
          <strong>${escapeHtml(venueName)}</strong>.</p>
         <p><a class="btn" href="${escapeHtml(link)}">Choose a new password</a></p>
         <p class="muted">The link expires in ${ttlMinutes} minutes and can be
          used once. If you did not request this, ignore this message — your
          password has not changed.</p>`,
      ),
    });
  }

  staffInvite(params: {
    to: string;
    venueName: string;
    role: string;
    inviterName: string;
    link: string;
    ttlDays: number;
  }) {
    const { to, venueName, role, inviterName, link, ttlDays } = params;
    return this.send({
      to,
      kind: 'portal.staff_invite',
      subject: `You've been invited to the ${venueName} portal`,
      text:
        `${inviterName} invited you to the ${venueName} staff portal as ${role}.\n\n` +
        `Set your password to activate the account:\n${link}\n\n` +
        `The invite expires in ${ttlDays} days.\n`,
      html: layout(
        `You've been invited`,
        `<p>${escapeHtml(inviterName)} invited you to the
          <strong>${escapeHtml(venueName)}</strong> staff portal as
          <strong>${escapeHtml(role)}</strong>.</p>
         <p><a class="btn" href="${escapeHtml(link)}">Set your password</a></p>
         <p class="muted">The invite expires in ${ttlDays} days.</p>`,
      ),
    });
  }
}

/** Enough to correlate a failure with a staff row; not the whole address. */
function redact(email: string): string {
  const [user, domain] = email.split('@');
  if (!domain) return '<invalid>';
  return `${user.slice(0, 2)}***@${domain}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function layout(heading: string, body: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f5f4f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:8px;padding:32px">
    <h1 style="margin:0 0 16px;font-size:20px;font-weight:600">${escapeHtml(heading)}</h1>
    <style>
      .btn{display:inline-block;padding:12px 20px;background:#1a1a1a;color:#fff;
           text-decoration:none;border-radius:6px;font-weight:600;margin:8px 0}
      .muted{color:#6b6b6b;font-size:13px;line-height:1.5}
      p{line-height:1.6;margin:0 0 16px}
    </style>
    ${body}
    <p class="muted" style="margin-top:32px;border-top:1px solid #e5e5e5;padding-top:16px">
      Heroes Experience Platform
    </p>
  </div>
</body></html>`;
}
