// ============================================================
// LandmarkController — Sprint 25
//
// CRITICAL: NestJS routing rule — specific routes MUST come
// before any parameterized :id route. This controller has no
// parameterized routes so ordering is straightforward.
// ============================================================

import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { LandmarkService } from './landmark.service';

@Controller('api/landmarks')
export class LandmarkController {
  constructor(private readonly landmarkService: LandmarkService) {}

  // GET /api/landmarks/debug
  @Get('debug')
  async debug() {
    const data = await this.landmarkService.debugTables();
    return { status: 'ok', data };
  }

  // GET /api/landmarks/nearby?lat=38.67&lon=-121.23&root_id=<uuid>
  @Get('nearby')
  async nearby(
    @Query('lat') lat: string,
    @Query('lon') lon: string,
    @Query('root_id') rootId: string,
  ) {
    if (!lat || !lon || !rootId) {
      return { status: 'error', message: 'lat, lon, and root_id are required' };
    }
    const data = await this.landmarkService.findNearby(
      parseFloat(lat),
      parseFloat(lon),
      rootId,
    );
    return { status: 'ok', data };
  }

  // POST /api/landmarks/bootstrap
  @Post('bootstrap')
  async bootstrap() {
    const data = await this.landmarkService.bootstrapTables();
    return { status: 'ok', data };
  }

  // POST /api/landmarks/seed
  @Post('seed')
  async seed() {
    const data = await this.landmarkService.seedLandmarks();
    return { status: 'ok', data };
  }

  // POST /api/landmarks/discover
  // Body: { root_id: string, landmark_id: string }
  @Post('discover')
  async discover(@Body() body: { root_id: string; landmark_id: string }) {
    if (!body.root_id || !body.landmark_id) {
      return { status: 'error', message: 'root_id and landmark_id are required' };
    }
    try {
      const data = await this.landmarkService.discoverFragment(
        body.root_id,
        body.landmark_id,
      );
      return { status: 'ok', data };
    } catch (err: any) {
      return { status: 'error', message: err.message };
    }
  }
}
