// src/feedback/feedback.module.ts

import { Module } from '@nestjs/common';
import { FeedbackController } from './feedback.controller';
import { FeedbackService } from './feedback.service';
import { PrismaService } from '../prisma.service';
import { EventsModule } from '../events/events.module';
import { MailModule } from '../mail/mail.module';
import { FeedbackDigestService } from './feedback.digest';

@Module({
  imports: [EventsModule, MailModule],
  controllers: [FeedbackController],
  providers: [FeedbackService, FeedbackDigestService, PrismaService],
  exports: [FeedbackService, FeedbackDigestService],
})
export class FeedbackModule {}
