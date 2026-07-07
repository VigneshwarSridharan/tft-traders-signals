import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SentMailController } from './sent-mail.controller';
import { SentMailService } from './sent-mail.service';

@Module({
  imports: [AuthModule],
  controllers: [SentMailController],
  providers: [SentMailService],
})
export class SentMailModule {}
