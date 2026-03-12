// backend/src/veil/veil.module.ts
import { Module } from '@nestjs/common';
import { VeilController } from './veil.controller';
import { VeilService } from './veil.service';
import { PrismaService } from '../prisma.service';
import { VenturesModule } from '../quest/ventures.module';

@Module({
  imports: [VenturesModule],
  controllers: [VeilController],
  providers: [VeilService, PrismaService],
  exports: [VeilService],
})
export class VeilModule {}
