import { Module } from '@nestjs/common';
import { SanctumController } from './sanctum.controller';
import { SanctumService } from './sanctum.service';
import { PrismaService } from '../prisma.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports:     [AuthModule],
  controllers: [SanctumController],
  providers:   [SanctumService, PrismaService],
  exports:     [SanctumService],
})
export class SanctumModule {}
