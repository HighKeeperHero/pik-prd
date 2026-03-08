// src/titles/titles.module.ts
import { Module } from '@nestjs/common';
import { TitlesService } from './titles.service';
import { TitlesController } from './titles.controller';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [TitlesController],
  providers:   [TitlesService, PrismaService],
  exports:     [TitlesService],
})
export class TitlesModule {}
