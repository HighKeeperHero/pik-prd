// ============================================================
// WarbandController — Sprint 23
// Routes: /api/warbands/*  /api/heroes/:root_id/profile
// Place at: src/warband/warband.controller.ts
// ============================================================

import {
  Controller, Get, Post, Put, Delete,
  Param, Body, Query,
} from '@nestjs/common';
import { WarbandService } from './warband.service';

@Controller('api')
export class WarbandController {
  constructor(private readonly warbands: WarbandService) {}

  /** POST /api/warbands — Create a new Warband */
  @Post('warbands')
  async createWarband(@Body() body: { root_id: string; name: string; emblem?: string; alignment?: string }) {
    return this.warbands.createWarband(body.root_id, {
      name:      body.name,
      emblem:    body.emblem,
      alignment: body.alignment,
    });
  }

  /** GET /api/warbands — Search / list Warbands */
  @Get('warbands')
  async searchWarbands(
    @Query('q')         query?:     string,
    @Query('alignment') alignment?: string,
  ) {
    return this.warbands.searchWarbands(query, alignment);
  }

  /** GET /api/warbands/:warband_id — Full Warband detail */
  @Get('warbands/:warband_id')
  async getWarband(
    @Param('warband_id') warbandId:          string,
    @Query('root_id')    requestingRootId?:  string,
  ) {
    return this.warbands.getWarband(warbandId, requestingRootId);
  }

  /** PUT /api/warbands/:warband_id/name — Rename (Officer+) */
  @Put('warbands/:warband_id/name')
  async renameWarband(
    @Param('warband_id') warbandId: string,
    @Body() body: { root_id: string; name: string },
  ) {
    return this.warbands.renameWarband(warbandId, body.root_id, body.name);
  }

  /** DELETE /api/warbands/:warband_id — Disband (Founder only) */
  @Delete('warbands/:warband_id')
  async disbandWarband(
    @Param('warband_id') warbandId: string,
    @Body() body: { root_id: string },
  ) {
    return this.warbands.disbandWarband(warbandId, body.root_id);
  }

  /** GET /api/warbands/my/:root_id — Get hero's current Warband */
  @Get('warbands/my/:root_id')
  async getMyWarband(@Param('root_id') rootId: string) {
    return this.warbands.getMyWarband(rootId);
  }

  /** POST /api/warbands/:warband_id/invite — Create invite code (Officer+) */
  @Post('warbands/:warband_id/invite')
  async createInvite(
    @Param('warband_id') warbandId: string,
    @Body() body: { root_id: string },
  ) {
    return this.warbands.createInvite(warbandId, body.root_id);
  }

  /** POST /api/warbands/join — Accept invite by code */
  @Post('warbands/join')
  async acceptInvite(@Body() body: { root_id: string; invite_code: string }) {
    return this.warbands.acceptInvite(body.root_id, body.invite_code);
  }

  /** POST /api/warbands/:warband_id/leave — Leave Warband */
  @Post('warbands/:warband_id/leave')
  async leaveWarband(
    @Param('warband_id') warbandId: string,
    @Body() body: { root_id: string },
  ) {
    return this.warbands.leaveWarband(warbandId, body.root_id);
  }

  /** POST /api/warbands/:warband_id/kick — Kick member (Officer+) */
  @Post('warbands/:warband_id/kick')
  async kickMember(
    @Param('warband_id') warbandId: string,
    @Body() body: { root_id: string; target_root_id: string },
  ) {
    return this.warbands.kickMember(warbandId, body.root_id, body.target_root_id);
  }

  /** PUT /api/warbands/:warband_id/rank — Set member rank (Founder only) */
  @Put('warbands/:warband_id/rank')
  async setRank(
    @Param('warband_id') warbandId: string,
    @Body() body: { root_id: string; target_root_id: string; rank: string },
  ) {
    return this.warbands.setRank(warbandId, body.root_id, body.target_root_id, body.rank);
  }

  /** POST /api/warbands/bootstrap — Create tables if missing */
  @Post('warbands/bootstrap')
  async bootstrap() {
    const results: string[] = [];
    const prisma = (this.warbands as any).prisma;
    for (const sql of [
      `CREATE TABLE IF NOT EXISTS "warbands" ("id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(), "name" TEXT NOT NULL, "emblem" TEXT NOT NULL DEFAULT '⚔', "alignment" TEXT NOT NULL DEFAULT 'NONE', "reputation" INTEGER NOT NULL DEFAULT 0, "founded_at" TIMESTAMP NOT NULL DEFAULT NOW(), "founder_root_id" TEXT NOT NULL REFERENCES "root_identities"("id") ON DELETE CASCADE)`,
      `CREATE INDEX IF NOT EXISTS "warbands_alignment_idx" ON "warbands" ("alignment")`,
      `CREATE TABLE IF NOT EXISTS "warband_memberships" ("id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(), "warband_id" TEXT NOT NULL REFERENCES "warbands"("id") ON DELETE CASCADE, "root_id" TEXT NOT NULL REFERENCES "root_identities"("id") ON DELETE CASCADE, "rank" TEXT NOT NULL DEFAULT 'MEMBER', "alignment_bonus" BOOLEAN NOT NULL DEFAULT false, "joined_at" TIMESTAMP NOT NULL DEFAULT NOW(), UNIQUE ("warband_id", "root_id"))`,
      `CREATE INDEX IF NOT EXISTS "warband_memberships_root_idx" ON "warband_memberships" ("root_id")`,
      `CREATE TABLE IF NOT EXISTS "warband_invites" ("id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(), "warband_id" TEXT NOT NULL REFERENCES "warbands"("id") ON DELETE CASCADE, "invited_by_root_id" TEXT NOT NULL REFERENCES "root_identities"("id") ON DELETE CASCADE, "invite_code" TEXT NOT NULL UNIQUE, "status" TEXT NOT NULL DEFAULT 'pending', "expires_at" TIMESTAMP NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT NOW())`,
      `CREATE INDEX IF NOT EXISTS "warband_invites_code_idx" ON "warband_invites" ("invite_code")`,
    ]) {
      try {
        await prisma.$executeRawUnsafe(sql);
        results.push('OK');
      } catch (e: any) {
        results.push(e.message?.includes('already exists') ? 'exists' : `ERR: ${e.message}`);
      }
    }
    return { bootstrapped: results };
  }

  /** GET /api/heroes/:root_id/profile — Public hero profile */
  @Get('heroes/:root_id/profile')
  async getHeroProfile(@Param('root_id') rootId: string) {
    return this.warbands.getHeroPublicProfile(rootId);
  }
  /** GET /api/warbands/debug — Check table existence and Prisma connectivity */
  @Get('warbands/debug')
  async debug() {
    const prisma = (this.warbands as any).prisma;
    const results: Record<string, any> = {};
    for (const [key, table] of [
      ['warbands',            '"warbands"'],
      ['warband_memberships', '"warband_memberships"'],
      ['warband_invites',     '"warband_invites"'],
    ]) {
      try {
        const rows = await prisma.$queryRawUnsafe(`SELECT COUNT(*) FROM ${table}`);
        results[key] = { exists: true, count: Number((rows as any)[0].count) };
      } catch (e: any) {
        results[key] = { exists: false, error: e.message };
      }
    }
    // Test Prisma model access
    try {
      await prisma.warband.count();
      results['prisma_warband_model'] = 'ok';
    } catch (e: any) {
      results['prisma_warband_model'] = e.message;
    }
    return results;
  }


}
