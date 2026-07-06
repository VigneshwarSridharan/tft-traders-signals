import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MailConnectionTester } from './mail-connection-tester.service';
import { SenderAccountsController } from './sender-accounts.controller';
import { SenderAccountsService } from './sender-accounts.service';

@Module({
  imports: [AuthModule],
  controllers: [SenderAccountsController],
  providers: [SenderAccountsService, MailConnectionTester],
})
export class SenderAccountsModule {}
