// backend/src/veil/veil.module.ts
import { Module } from '@nestjs/common';
import { VeilController } from './veil.controller';
import { VeilService } from './veil.service';
import { PrismaService } from '../prisma.service';
import { ConfigService } from '../config/config.service';
import { TearGenService } from './tear-gen.service';
import { VenturesModule } from '../quest/ventures.module';
import { QuestModule } from '../quest/quest.module';
import { LevelingModule } from '../leveling/leveling.module';
import { LoreModule } from '../lore/lore.module';

@Module({
  imports:     [VenturesModule, QuestModule, LevelingModule, LoreModule],
  controllers: [VeilController],
  providers:   [VeilService, PrismaService, ConfigService, TearGenService],
  exports:     [VeilService],
})
export class VeilModule {}
