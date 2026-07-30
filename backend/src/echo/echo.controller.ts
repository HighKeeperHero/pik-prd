// ============================================================
// PIK — Hero Echo Controller (canon §13.9 unification)
//   GET  /api/users/:root_id/echoes            — Altar registry
//   POST /api/users/:root_id/echoes/:echo_id/register — the rite
// ============================================================
import { Controller, Get, Post, Param, UseGuards, Req } from '@nestjs/common';
import { EchoService } from './echo.service';
import { AccountGuard } from '../auth/guards/account.guard';

@Controller('api')
export class EchoController {
  constructor(private readonly echo: EchoService) {}

  @Get('users/:root_id/echoes')
  async getEchoes(@Param('root_id') rootId: string) {
    return this.echo.getState(rootId);
  }

  @Post('users/:root_id/echoes/:echo_id/register')
  @UseGuards(AccountGuard)
  async register(
    @Param('root_id') rootId: string,
    @Param('echo_id') echoId: string,
    @Req() req: Request & { heroId: string },
  ) {
    if (req.heroId !== rootId) return { status: 'error', message: 'Unauthorized' };
    return this.echo.register(rootId, echoId);
  }
}
