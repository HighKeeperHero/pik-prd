import { Controller, Get, Query } from '@nestjs/common';
import { FlagsService } from './flags.service';

// Public (no AccountGuard): flags must resolve before login so
// pre-auth surfaces can gate too. Read-only; writes go through
// scripts/flags.ts.
@Controller('api/flags')
export class FlagsController {
  constructor(private readonly flags: FlagsService) {}

  @Get()
  async list(@Query('channel') channel?: string) {
    const resolved = await this.flags.forChannel((channel ?? '').trim());
    return { flags: resolved };
  }
}
