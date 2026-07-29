// ============================================================
// PIK — Doctrine Controller (canon §13.5)
//   GET  /api/users/:root_id/doctrine          — tree + state
//   POST /api/users/:root_id/doctrine/choose   — pick a branch
//   POST /api/users/:root_id/doctrine/respec   — Hall of Masters
// ============================================================
import { Controller, Get, Post, Param, Body, UseGuards, Req } from '@nestjs/common';
import { DoctrineService } from './doctrine.service';
import { AccountGuard } from '../auth/guards/account.guard';

@Controller('api')
export class DoctrineController {
  constructor(private readonly doctrine: DoctrineService) {}

  @Get('users/:root_id/doctrine')
  async getDoctrine(@Param('root_id') rootId: string) {
    return this.doctrine.getState(rootId);
  }

  @Post('users/:root_id/doctrine/choose')
  @UseGuards(AccountGuard)
  async choose(
    @Param('root_id') rootId: string,
    @Body() body: { node_id: string },
    @Req() req: Request & { heroId: string },
  ) {
    if (req.heroId !== rootId) return { status: 'error', message: 'Unauthorized' };
    return this.doctrine.choose(rootId, body.node_id);
  }

  @Post('users/:root_id/doctrine/respec')
  @UseGuards(AccountGuard)
  async respec(
    @Param('root_id') rootId: string,
    @Req() req: Request & { heroId: string },
  ) {
    if (req.heroId !== rootId) return { status: 'error', message: 'Unauthorized' };
    return this.doctrine.respec(rootId);
  }
}
