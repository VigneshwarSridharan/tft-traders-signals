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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AccessTokenPayload } from '../auth/jwt-payload.interface';
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
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<SentMailListResponse> {
    return this.sentMailService.list(query, user);
  }

  @Get(':id')
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(messageDetailQuerySchema))
    query: MessageDetailQueryDto,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<SentMailDetail> {
    return this.sentMailService.get(id, query, user);
  }

  @Post(':id/tags')
  @Roles('admin', 'manager', 'agent')
  addTag(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(assignMessageTagSchema))
    body: AssignMessageTagDto,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<SentMailDetail> {
    return this.sentMailService.addTag(id, body.tagId, user);
  }

  @Delete(':id/tags/:tagId')
  @Roles('admin', 'manager', 'agent')
  removeTag(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('tagId', ParseUUIDPipe) tagId: string,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<SentMailDetail> {
    return this.sentMailService.removeTag(id, tagId, user);
  }
}
