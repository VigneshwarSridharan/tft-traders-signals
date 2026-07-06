import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { TemplateCategorySummary } from '@tft/shared';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { TemplateCategoriesService } from './template-categories.service';
import {
  createTemplateCategorySchema,
  updateTemplateCategorySchema,
  type CreateTemplateCategoryDto,
  type UpdateTemplateCategoryDto,
} from './dto/template-categories.schemas';

@Controller('template-categories')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TemplateCategoriesController {
  constructor(
    private readonly templateCategoriesService: TemplateCategoriesService,
  ) {}

  @Get()
  list(): Promise<TemplateCategorySummary[]> {
    return this.templateCategoriesService.list();
  }

  @Post()
  @Roles('admin')
  create(
    @Body(new ZodValidationPipe(createTemplateCategorySchema))
    body: CreateTemplateCategoryDto,
  ): Promise<TemplateCategorySummary> {
    return this.templateCategoriesService.create(body);
  }

  @Patch(':id')
  @Roles('admin')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateTemplateCategorySchema))
    body: UpdateTemplateCategoryDto,
  ): Promise<TemplateCategorySummary> {
    return this.templateCategoriesService.update(id, body);
  }

  @Delete(':id')
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.templateCategoriesService.delete(id);
  }
}
