import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { SentMailDetail, SentMailListResponse } from '@tft/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  assignMessageTagSchema,
  messageDetailQuerySchema,
  sentMailListQuerySchema,
  type AssignMessageTagDto,
  type MessageDetailQueryDto,
  type SentMailListQueryDto,
} from './dto/sent-mail.schemas';
import { SentMailService } from './sent-mail.service';

@Controller('sent-mail')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SentMailController {
  constructor(private readonly sentMailService: SentMailService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(sentMailListQuerySchema))
    query: SentMailListQueryDto,
  ): Promise<SentMailListResponse> {
    return this.sentMailService.list(query);
  }

  @Get(':id')
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(messageDetailQuerySchema))
    query: MessageDetailQueryDto,
  ): Promise<SentMailDetail> {
    return this.sentMailService.get(id, query);
  }

  @Post(':id/tags')
  addTag(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(assignMessageTagSchema))
    body: AssignMessageTagDto,
  ): Promise<SentMailDetail> {
    return this.sentMailService.addTag(id, body.tagId);
  }

  @Delete(':id/tags/:tagId')
  removeTag(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('tagId', ParseUUIDPipe) tagId: string,
  ): Promise<SentMailDetail> {
    return this.sentMailService.removeTag(id, tagId);
  }
}
