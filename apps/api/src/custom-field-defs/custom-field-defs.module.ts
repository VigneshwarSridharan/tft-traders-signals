import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CustomFieldDefsController } from './custom-field-defs.controller';
import { CustomFieldDefsService } from './custom-field-defs.service';

@Module({
  imports: [AuthModule],
  controllers: [CustomFieldDefsController],
  providers: [CustomFieldDefsService],
})
export class CustomFieldDefsModule {}
