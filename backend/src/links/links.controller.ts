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
   * Where someone without the app is sent.
   *
   * Also the intent:// fallback: if the OS cannot resolve the scheme —
   * app absent, or a QR app's in-app browser that will not follow an
   * intent — the browser lands here instead of on "link invalid". A dead
   * end at this exact moment is a walk-in guest lost.
   */
  @Get('get')
  getApp(@Res() res: Response) {
    return res.type('html').send(getPage());
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
function baseUrl(): string {
  const explicit = process.env.PORTAL_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  const railway = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
  if (railway) return `https://${railway}`;
  return `http://localhost:${process.env.PORT ?? '8080'}`;
}

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
  // S.browser_fallback_url is the difference between a graceful landing
  // and "link invalid". Without it, an unresolvable intent — app not
  // installed, or an in-app browser that will not follow one — dead-ends
  // the guest. With it, they arrive somewhere that explains itself.
  const intentUrl =
    `intent://${path}#Intent;scheme=heroescodex;` +
    `package=com.heroesveritas.codex;` +
    `S.browser_fallback_url=${encodeURIComponent(`${baseUrl()}/get`)};end`;

  // One destination, always present. Previously these were per-store
  // links gated on env, so with neither configured the page offered a
  // guest nothing at all — the "Open" button was the only control and it
  // is useless to someone who does not have the app.
  const storeBlock = `<a class="alt" href="/get">GET THE APP</a>`;

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
    Nothing happens when you tap? You do not have the Codex yet — the
    second link explains how to get it.
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

/**
 * "Get the app" — the page a guest without the Codex actually lands on.
 *
 * Follows the public codexpwa landing (Cinzel, gold, centred, the ◈
 * ornament) so a walk-in who has seen the marketing recognises it, but
 * updated to what is TRUE now: that page still says "Heroes Veritas is
 * now an iOS application", written before the Android alpha existed.
 * A page that misdescribes which platforms work is worse than no page,
 * because the guest concludes the problem is their phone.
 *
 * Store buttons appear only when their URL is configured. Until then it
 * says plainly that this is closed testing and how to ask — no invented
 * ids, no links known to be dead.
 */
function getPage(): string {
  const store = storeLinks();
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const buttons = [
    store.android
      ? `<a class="cta" href="${esc(store.android)}">GET IT ON ANDROID</a>`
      : '',
    store.ios ? `<a class="cta" href="${esc(store.ios)}">GET IT ON iOS</a>` : '',
  ].filter(Boolean).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#06080F">
<title>Heroes' Codex</title>
<link rel="stylesheet" href="/heroes.css">
<meta name="description" content="Heroes' Codex — a narrative-driven mobile RPG. Currently in closed testing.">
<style>
  body{display:flex;flex-direction:column;align-items:center;justify-content:center;
       min-height:100vh;padding:40px 24px 64px;text-align:center}
  .ornament{display:flex;align-items:center;justify-content:center;gap:12px;
            margin-bottom:18px;opacity:.7}
  .ornament span{color:var(--gold)}
  .ornament hr{width:60px;height:1px;background:var(--line);border:0}
  .title{font-family:var(--font-display);font-weight:700;
         font-size:clamp(34px,7vw,52px);color:var(--gold);letter-spacing:2px;
         line-height:1.05;margin:0 0 6px;text-shadow:0 0 28px var(--gold-glow)}
  .divider{width:60px;height:1px;background:var(--gold-glow);margin:26px auto}
  p{max-width:520px;margin:0 auto 18px;font-size:16px;line-height:1.6}
  .cta{display:inline-block;margin:8px 6px 0;padding:14px 30px;background:var(--gold);
       color:var(--bg);font:400 14px/1 var(--font-title);letter-spacing:2px;
       text-decoration:none;border-radius:6px;box-shadow:0 0 24px var(--gold-glow)}
  .stub{display:inline-block;margin-top:12px;padding:12px 20px;
        background:var(--bg-elevated);border:1px solid var(--line);border-radius:6px;
        color:var(--muted);font-size:13px;letter-spacing:1px}
  .stub strong{color:var(--gold);font-family:var(--font-title)}
  .legal{margin-top:52px;font-size:11px;color:var(--dim);letter-spacing:1.5px}
</style>
</head>
<body>
  <div class="ornament"><hr><span>◈</span><hr></div>
  <div class="eyebrow">THE VEIL CALLS YOU</div>
  <h1 class="title">HEROES'&nbsp;CODEX</h1>

  <div class="divider"></div>

  ${
    buttons ||
    `<p>The Codex is in <strong>closed testing</strong> and is not on the app
       stores yet.</p>
     <p class="muted" style="font-size:15px">
       If you are at a venue, a member of staff can seat you without it —
       you will be given a code to claim your rewards once you have the app.
     </p>
     <a class="cta" href="mailto:developer@heroesveritas.com?subject=Codex%20access">
       REQUEST ACCESS
     </a>
     <div class="stub">Coming to <strong>Android</strong> and <strong>iOS</strong></div>`
  }

  <h2>ABOUT</h2>
  <p class="muted" style="font-size:15px">
    A narrative-driven mobile RPG. Walk the Awakening, tend your Sanctum, and
    seal the tears that bleed through the Veil. Built with a hard commitment
    to ethical monetization — no loot boxes, no gambling, spending dashboards
    and caps in your hands.
  </p>

  <div class="legal">© 2026 Heroes Veritas</div>
</body>
</html>`;
}
