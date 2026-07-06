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
import type { TagSummary } from '@tft/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { TagsService } from './tags.service';
import {
  createTagSchema,
  updateTagSchema,
  type CreateTagDto,
  type UpdateTagDto,
} from './dto/tags.schemas';

@Controller('tags')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  @Get()
  list(): Promise<TagSummary[]> {
    return this.tagsService.list();
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(createTagSchema)) body: CreateTagDto,
  ): Promise<TagSummary> {
    return this.tagsService.create(body);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateTagSchema)) body: UpdateTagDto,
  ): Promise<TagSummary> {
    return this.tagsService.update(id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.tagsService.delete(id);
  }
}
