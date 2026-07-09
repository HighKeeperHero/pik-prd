import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class FlagsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Resolved flag map for a channel: default rows (channel '')
   *  overlaid by the channel's own rows. Keys absent here are the
   *  client's business (it carries fail-open defaults). */
  async forChannel(channel: string): Promise<Record<string, boolean>> {
    const rows = await this.prisma.featureFlag.findMany({
      where: { channel: { in: ['', channel] } },
      orderBy: { channel: 'asc' },   // '' sorts first → channel rows overwrite
    });
    const flags: Record<string, boolean> = {};
    for (const row of rows) flags[row.key] = row.enabled;
    return flags;
  }
}
