// ============================================================
// PIK — Doctrine Module (canon §13.5)
// ============================================================
import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { DoctrineService } from './doctrine.service';
import { DoctrineController } from './doctrine.controller';

@Module({
  controllers: [DoctrineController],
  providers:   [DoctrineService, PrismaService],
  exports:     [DoctrineService],
})
export class DoctrineModule {}
