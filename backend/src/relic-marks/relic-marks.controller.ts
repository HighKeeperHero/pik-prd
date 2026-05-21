// ============================================================
// PIK — Relic Marks Controller
// Routes: /api/relic-marks/*
//
// XR interop seam: a stable URL contract that any future
// spatial client (Vision Pro, AR overlays, partner integrations)
// can hit to fetch the USDZ asset for a given Reliquary Mark.
//
// Asset resolution order:
//   1. backend/assets/ar/<slug>.usdz                (per-Mark art)
//   2. backend/assets/ar/placeholder.usdz           (generic stand-in)
//   3. 302 redirect to AR_PLACEHOLDER_USDZ_URL      (Apple sample)
//
// Bypasses the global ResponseInterceptor via @Res() — binary
// USDZ bytes must not be JSON-wrapped.
// ============================================================

import {
  Controller,
  Get,
  Param,
  Res,
  BadRequestException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { join } from 'path';
import { existsSync } from 'fs';

const KNOWN_MARK_SLUGS = ['pale', 'forge', 'veil', 'hearth'] as const;
type MarkSlug = typeof KNOWN_MARK_SLUGS[number];

const FALLBACK_USDZ_URL =
  process.env.AR_PLACEHOLDER_USDZ_URL ??
  'https://developer.apple.com/augmented-reality/quick-look/models/toycar/toy_car.usdz';

const USDZ_MIME = 'model/vnd.usdz+zip';

function assetPath(filename: string): string {
  return join(process.cwd(), 'assets', 'ar', filename);
}

@Controller('api/relic-marks')
export class RelicMarksController {
  @Get(':slug/ar')
  serveArAsset(@Param('slug') slug: string, @Res() res: Response) {
    if (!KNOWN_MARK_SLUGS.includes(slug as MarkSlug)) {
      throw new BadRequestException(`unknown mark slug: ${slug}`);
    }

    const perMark = assetPath(`${slug}.usdz`);
    if (existsSync(perMark)) {
      res.setHeader('Content-Type', USDZ_MIME);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.sendFile(perMark);
    }

    const placeholder = assetPath('placeholder.usdz');
    if (existsSync(placeholder)) {
      res.setHeader('Content-Type', USDZ_MIME);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.sendFile(placeholder);
    }

    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.redirect(HttpStatus.FOUND, FALLBACK_USDZ_URL);
  }
}
