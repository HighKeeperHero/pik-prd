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
 * Where to send someone who does not have the app.
 *
 * Env-driven and ABSENT BY DEFAULT. The first version of this page
 * shipped a hardcoded Play URL and an INVENTED App Store id
 * (`id0000000000`) — a fabricated identifier can resolve to a stranger's
 * app, so a Heroes-branded page could have handed a guest to someone
 * else's product. Neither store listing exists yet.
 *
 * A link you know is dead is worse than no link: it tells the guest the
 * problem is theirs. So when these are unset the page says plainly that
 * the app is not public yet and to ask a member of staff — and lights up
 * on its own, with no code change, the day the listings exist.
 */
function storeLinks(): { android: string | null; ios: string | null } {
  return {
    android: process.env.ANDROID_STORE_URL?.trim() || null,
    ios: process.env.IOS_STORE_URL?.trim() || null,
  };
}

/**
 * The bounce page.
 *
 * ── Why there is no automatic redirect ─────────────────────────
 * The first version fired the scheme from a `setTimeout`. Android Chrome
 * blocks custom-scheme navigation without a user gesture, and iOS Safari
 * answers a failed one with "cannot open the page" — so it did nothing
 * useful and could produce an error dialog for a guest holding a phone
 * in a queue. One deliberate tap is more predictable than a redirect
 * that fails differently on every browser.
 *
 * ── Why Android gets a different URL ───────────────────────────
 * Chrome will not follow `heroescodex://` from a page even on a tap.
 * `intent://` is the supported mechanism: it names the package, so the
 * OS resolves it without the browser having to trust an unknown scheme.
 * iOS Safari honours the plain scheme on a tap, and has no intent://.
 */
function page(o: {
  deepLink: string;
  title: string;
  lede: string;
  showActions: boolean;
}): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // heroescodex://venue/abc -> intent://venue/abc#Intent;scheme=...;package=...;end
  const path = o.deepLink.replace(/^heroescodex:\/\//, '');
  const intentUrl =
    `intent://${path}#Intent;scheme=heroescodex;` +
    `package=com.heroesveritas.codex;end`;

  const store = storeLinks();
  const storeBlock = [
    store.android
      ? `<a class="alt" href="${esc(store.android)}">GET IT ON ANDROID</a>`
      : '',
    store.ios ? `<a class="alt" href="${esc(store.ios)}">GET IT ON iOS</a>` : '',
  ].join('');

  const noStores = !store.android && !store.ios;

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
  /* Tapped one-handed, standing, possibly in a queue. */
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
  ${storeBlock}
  <p class="dim" style="margin-top:26px">
    ${
      noStores
        ? 'Heroes’ Codex is in closed testing and is not on the app stores yet. ' +
          'If you do not have it, ask a member of staff.'
        : 'Nothing happens when you tap? The app is not installed yet — use a link above.'
    }
  </p>`
      : ''
  }
</div>
${
  o.showActions
    ? `<script>
// Android Chrome refuses a bare custom scheme even on a tap; intent://
// names the package so the OS resolves it. iOS Safari has no intent://
// and honours the plain scheme, so it keeps the server-rendered href.
if (/android/i.test(navigator.userAgent)) {
  document.getElementById('open').setAttribute('href', ${JSON.stringify(intentUrl)});
}
</script>`
    : ''
}
</body>
</html>`;
}
