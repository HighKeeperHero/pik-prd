// ============================================================
// HEP — scannable links
//
// Routes: /v/:sourceId  (venue check-in)
//         /t/:token     (guest testament)
//
// ── Why these exist ────────────────────────────────────────────
// The venue QR used to encode `heroescodex://venue/<id>` directly, and a
// generic phone QR reader answers that with "no usable data found".
// Third-party scanners only act on a whitelist — http(s), tel, mailto,
// WIFI:, vCard — and treat an unknown scheme as an opaque string. The
// earlier device verification fired `am start -a VIEW -d <url>`, which
// exercises Android's scheme resolution and never involves the scanner,
// so it proved the wrong layer.
//
// An https URL is universally scannable. It also fixes a second, larger
// hole: a walk-in guest WITHOUT the app previously scanned the sign and
// got nothing at all — no prompt, no explanation, no way in. They are
// the exact person the guest flow exists to capture.
//
// ── Not yet App Links ──────────────────────────────────────────
// This page bounces through the browser. Android App Links / iOS
// Universal Links would open the app directly with no bounce, but they
// need `/.well-known/assetlinks.json` with the release SHA256 cert
// fingerprint (and an apple-app-site-association), plus intent filters
// compiled into a NEW native build. This works today, on every scanner,
// with no rebuild — and the URL does not change when App Links land, so
// signs printed now keep working.
//
// Place at: src/links/links.controller.ts
// ============================================================

import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from '../prisma.service';

@Controller()
export class LinksController {
  constructor(private readonly prisma: PrismaService) {}

  /** What a venue's printed sign points at. */
  @Get('v/:sourceId')
  async venue(@Param('sourceId') sourceId: string, @Res() res: Response) {
    const venue = await this.prisma.source.findUnique({
      where: { id: sourceId },
      select: { name: true, status: true, sourceType: true },
    });

    // Naming the venue is safe — it is printed on the sign the player is
    // standing in front of — and it is the difference between a page
    // that looks legitimate and one that looks like a phishing bounce.
    const known = !!venue && venue.status === 'active' && venue.sourceType !== 'first_party';

    return res.type('html').send(
      page({
        deepLink: `heroescodex://venue/${sourceId}`,
        title: known ? venue!.name : 'Venue not found',
        lede: known
          ? 'Open Heroes’ Codex to let this venue record your deeds.'
          : 'This code does not match an active venue. Ask a member of staff.',
        showActions: known,
      }),
    );
  }

  /**
   * A guest's claim link.
   *
   * Deliberately says NOTHING about the token — not whether it is valid,
   * not what it is worth. It is a bearer credential printed on a receipt
   * that may be dropped on the floor, and a page that confirmed "yes,
   * this one is real and unspent" would make finding one worthwhile.
   */
  @Get('t/:token')
  testament(@Param('token') token: string, @Res() res: Response) {
    return res.type('html').send(
      page({
        deepLink: `heroescodex://testament/${encodeURIComponent(token)}`,
        title: 'Your testament',
        lede: 'Open Heroes’ Codex to inscribe what you did here.',
        showActions: true,
      }),
    );
  }
}

/**
 * The bounce page.
 *
 * Auto-attempts the scheme once, then relies on a real button. The
 * automatic attempt is a convenience; the button is the guarantee,
 * because a user gesture is the only thing every mobile browser will
 * reliably honour for a custom scheme. If the app is absent, nothing
 * happens and the install links are already on screen — no error dialog
 * to interpret, no dead end.
 */
function page(o: {
  deepLink: string;
  title: string;
  lede: string;
  showActions: boolean;
}): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Heroes' Codex</title>
<link rel="stylesheet" href="/heroes.css">
<style>
  .gate{min-height:88vh}
  .lede{font-size:17px;line-height:1.6;margin:0 0 28px}
  /* 56px: this is tapped one-handed, standing, possibly in a queue. */
  .cta{display:block;width:100%;text-align:center;padding:18px 20px;
       background:var(--accent);color:var(--bg);text-decoration:none;
       font:400 15px/1 var(--font-title);letter-spacing:2.5px}
  .alt{display:block;text-align:center;padding:14px;margin-top:10px;
       border:1px solid var(--line);color:var(--muted);text-decoration:none;
       font:400 13px/1 var(--font-title);letter-spacing:2px}
</style>
</head>
<body>
<div class="wrap gate">
  <div class="eyebrow">HEROES' CODEX</div>
  <h1>${esc(o.title)}</h1>
  <p class="lede muted" style="margin-top:18px">${esc(o.lede)}</p>
  ${
    o.showActions
      ? `<a class="cta" id="open" href="${esc(o.deepLink)}">OPEN THE CODEX</a>
  <a class="alt" href="https://play.google.com/store/apps/details?id=com.heroesveritas.codex">GET IT ON ANDROID</a>
  <a class="alt" href="https://apps.apple.com/app/heroes-codex/id0000000000">GET IT ON iOS</a>
  <p class="dim" style="margin-top:26px">
    Nothing happens when you tap? The app is not installed yet — use a link above.
  </p>`
      : ''
  }
</div>
${
  o.showActions
    ? `<script>
// One automatic attempt. If the app is installed this never renders;
// if it is not, the page simply stays put and the buttons are already
// there. No timers guessing at "did it work", which is what produces
// the false "app not installed" bounces on iOS.
setTimeout(function(){ window.location.href = ${JSON.stringify(o.deepLink)}; }, 250);
</script>`
    : ''
}
</body>
</html>`;
}
