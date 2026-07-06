import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TemplateCategoriesController } from './template-categories.controller';
import { TemplateCategoriesService } from './template-categories.service';

@Module({
  imports: [AuthModule],
  controllers: [TemplateCategoriesController],
  providers: [TemplateCategoriesService],
  exports: [TemplateCategoriesService],
})
export class TemplateCategoriesModule {}
