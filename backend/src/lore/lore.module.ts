import { Module } from '@nestjs/common';
import { LoreController } from './lore.controller';
import { LoreService } from './lore.service';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [LoreController],
  providers:   [LoreService, PrismaService],
  exports:     [LoreService],
})
export class LoreModule {}
