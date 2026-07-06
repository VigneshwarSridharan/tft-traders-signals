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
import type { CustomFieldDefSummary } from '@tft/shared';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CustomFieldDefsService } from './custom-field-defs.service';
import {
  createCustomFieldDefSchema,
  updateCustomFieldDefSchema,
  type CreateCustomFieldDefDto,
  type UpdateCustomFieldDefDto,
} from './dto/custom-field-defs.schemas';

@Controller('custom-field-defs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CustomFieldDefsController {
  constructor(
    private readonly customFieldDefsService: CustomFieldDefsService,
  ) {}

  @Get()
  list(): Promise<CustomFieldDefSummary[]> {
    return this.customFieldDefsService.list();
  }

  @Post()
  @Roles('admin')
  create(
    @Body(new ZodValidationPipe(createCustomFieldDefSchema))
    body: CreateCustomFieldDefDto,
  ): Promise<CustomFieldDefSummary> {
    return this.customFieldDefsService.create(body);
  }

  @Patch(':id')
  @Roles('admin')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateCustomFieldDefSchema))
    body: UpdateCustomFieldDefDto,
  ): Promise<CustomFieldDefSummary> {
    return this.customFieldDefsService.update(id, body);
  }

  @Delete(':id')
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.customFieldDefsService.delete(id);
  }
}
