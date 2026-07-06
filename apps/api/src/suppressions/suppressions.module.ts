import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SuppressionsController } from './suppressions.controller';
import { SuppressionsService } from './suppressions.service';

@Module({
  imports: [AuthModule],
  controllers: [SuppressionsController],
  providers: [SuppressionsService],
})
export class SuppressionsModule {}
