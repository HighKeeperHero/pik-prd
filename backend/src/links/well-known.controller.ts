// ============================================================
// HEP — deep-link domain association (/.well-known)
//
// These two files are what let a scan open the app DIRECTLY, with no
// browser bounce and no tap. iOS Universal Links and Android App Links
// both verify by fetching a file from the domain the link points at;
// if it names the app, the OS routes matching URLs into the app itself.
//
// This is the server half. It does NOTHING until a NEW native build
// ships with the matching associatedDomains (iOS) and autoVerify intent
// filters (Android) — those compile in, exactly like the scheme did. So
// this is safe to deploy today and simply lies dormant until the build
// that uses it exists. The /v/ and /t/ bounce pages keep working the
// whole time; App Links upgrade them, they do not replace them.
//
// ── Both files must be served EXACTLY ──────────────────────────
//   - over https (Railway is)
//   - unauthenticated
//   - Content-Type application/json
//   - NO redirect (Apple historically does not follow one)
// The bare path `/.well-known/apple-app-site-association` has no file
// extension on purpose — that is the name Apple fetches.
//
// Place at: src/links/well-known.controller.ts
// ============================================================

import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';

// Apple Team ID + bundle id — from `eas credentials` (iOS), Timothy Base
// (Individual). This pair is public by design; it appears in every
// signed build and in the App Store listing, so there is nothing to
// leak by serving it.
const APPLE_APP_ID = '936L85M7CN.com.heroesveritas.codex';
const ANDROID_PACKAGE = 'com.heroesveritas.codex';

// Only these two prefixes open the app. NOT /get (a person there does
// not have the app, so routing it in would loop) and NOT the portal or
// support pages.
const DEEP_LINK_PREFIXES = ['/v/', '/t/'];

@Controller('.well-known')
export class WellKnownController {
  /**
   * iOS Universal Links.
   *
   * `components` is the modern form; `paths` is kept alongside because
   * older iOS still reads it, and serving both costs nothing.
   */
  @Get('apple-app-site-association')
  apple(@Res() res: Response) {
    return res.type('application/json').json({
      applinks: {
        apps: [],
        details: [
          {
            appID: APPLE_APP_ID,
            components: DEEP_LINK_PREFIXES.map((p) => ({ '/': `${p}*` })),
            paths: DEEP_LINK_PREFIXES.map((p) => `${p}*`),
          },
        ],
      },
    });
  }

  /**
   * Android App Links.
   *
   * The SHA-256 is read from ANDROID_CERT_SHA256 and the file is only
   * served when it is set. A fabricated fingerprint would silently fail
   * verification — Android would fall back to the disambiguation dialog
   * and nobody would know why — so, exactly as with the store links, an
   * absent value is stated plainly rather than guessed. Get it with:
   *   eas credentials -p android   (or `keytool -list` on the keystore)
   * then set it in Railway. Multiple fingerprints (debug + release, or a
   * key rotation) can be comma-separated.
   */
  @Get('assetlinks.json')
  android(@Res() res: Response) {
    const raw = process.env.ANDROID_CERT_SHA256?.trim();
    const fingerprints = raw
      ? raw.split(',').map((f) => f.trim()).filter(Boolean)
      : [];

    if (fingerprints.length === 0) {
      // Honest 404 rather than a file that names no valid signer. An
      // assetlinks.json that verifies against nothing is worse than
      // absent: it looks configured while doing nothing.
      return res.status(404).json({
        error: 'not_configured',
        detail: 'ANDROID_CERT_SHA256 is not set on this deployment.',
      });
    }

    return res.type('application/json').json([
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: ANDROID_PACKAGE,
          sha256_cert_fingerprints: fingerprints,
        },
      },
    ]);
  }
}
