// ============================================================
// PIK — Relic Marks Controller
// Routes: /api/relic-marks/*
//
// XR interop seam: a stable URL contract that any future spatial
// client (iOS AR Quick Look, Android Scene Viewer, Vision Pro,
// partner integrations) can hit to fetch the 3D asset for a given
// Reliquary Mark.
//
// Asset resolution order (per platform):
//   iOS (default, or ?platform=ios):
//     1. backend/assets/ar/<slug>.usdz
//     2. backend/assets/ar/placeholder.usdz
//     3. 302 redirect to AR_PLACEHOLDER_USDZ_URL (Apple sample)
//   Android (?platform=android):
//     1. backend/assets/ar/<slug>.glb
//     2. backend/assets/ar/placeholder.glb
//     3. 404 JSON ({ error: 'asset_pending' }) — no public Android fallback
//
// Bypasses the global ResponseInterceptor via @Res() — binary 3D
// bytes must not be JSON-wrapped.
// ============================================================

import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  BadRequestException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { join } from 'path';
import { existsSync } from 'fs';

const KNOWN_MARK_SLUGS = ['pale', 'forge', 'veil', 'hearth'] as const;
type MarkSlug = typeof KNOWN_MARK_SLUGS[number];

type Platform = 'ios' | 'android';

const USDZ_MIME = 'model/vnd.usdz+zip';
const GLB_MIME  = 'model/gltf-binary';

const FALLBACK_USDZ_URL =
  process.env.AR_PLACEHOLDER_USDZ_URL ??
  'https://developer.apple.com/augmented-reality/quick-look/models/toycar/toy_car.usdz';

function assetPath(filename: string): string {
  return join(process.cwd(), 'assets', 'ar', filename);
}

function resolvePlatform(raw: unknown): Platform {
  return raw === 'android' ? 'android' : 'ios';
}

@Controller('api/relic-marks')
export class RelicMarksController {
  @Get(':slug/ar')
  serveArAsset(
    @Param('slug') slug: string,
    @Query('platform') platformParam: string | undefined,
    @Res() res: Response,
  ) {
    if (!KNOWN_MARK_SLUGS.includes(slug as MarkSlug)) {
      throw new BadRequestException(`unknown mark slug: ${slug}`);
    }

    const platform = resolvePlatform(platformParam);
    const ext  = platform === 'android' ? 'glb' : 'usdz';
    const mime = platform === 'android' ? GLB_MIME : USDZ_MIME;

    const perMark = assetPath(`${slug}.${ext}`);
    if (existsSync(perMark)) {
      res.setHeader('Content-Type', mime);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.sendFile(perMark);
    }

    const placeholder = assetPath(`placeholder.${ext}`);
    if (existsSync(placeholder)) {
      res.setHeader('Content-Type', mime);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.sendFile(placeholder);
    }

    // Final fallback — iOS gets an Apple sample model so the seam can
    // demo end-to-end; Android has no equally-stable public GLB to
    // redirect to, so we 404 and let the client render its fallback.
    if (platform === 'ios') {
      res.setHeader('Cache-Control', 'public, max-age=300');
      return res.redirect(HttpStatus.FOUND, FALLBACK_USDZ_URL);
    }
    return res.status(HttpStatus.NOT_FOUND).json({
      status: 'error',
      error:  'asset_pending',
      message: `No GLB asset available for ${slug}. Drop assets/ar/${slug}.glb to ship.`,
    });
  }
}
