import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type {
  ComposeSenderAccountOption,
  ComposeSendResponse,
  ComposeTestSendResponse,
  EmailMessageDetail,
  EmailMessageListResponse,
  EmailMessageTimelineResponse,
  SavedMessageFilter,
} from '@tft/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AccessTokenPayload } from '../auth/jwt-payload.interface';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { MAX_TOTAL_ATTACHMENT_BYTES } from './attachment-storage.util';
import {
  assignMessageTagSchema,
  composeTestSendSchema,
  createSavedMessageFilterSchema,
  messageListQuerySchema,
  parseComposePayload,
  timelineQuerySchema,
  type AssignMessageTagDto,
  type ComposeTestSendDto,
  type CreateSavedMessageFilterDto,
  type MessageListQueryDto,
  type TimelineQueryDto,
} from './dto/email-messages.schemas';
import { EmailMessagesService } from './email-messages.service';

@Controller('email-messages')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EmailMessagesController {
  constructor(private readonly emailMessagesService: EmailMessagesService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(messageListQuerySchema))
    query: MessageListQueryDto,
  ): Promise<EmailMessageListResponse> {
    return this.emailMessagesService.list(query);
  }

  @Get('sender-accounts')
  listSenderAccounts(): Promise<ComposeSenderAccountOption[]> {
    return this.emailMessagesService.listSenderAccountOptions();
  }

  @Get('saved-filters')
  listSavedFilters(
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<SavedMessageFilter[]> {
    return this.emailMessagesService.listSavedFilters(user.sub);
  }

  @Post('saved-filters')
  createSavedFilter(
    @Body(new ZodValidationPipe(createSavedMessageFilterSchema))
    body: CreateSavedMessageFilterDto,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<SavedMessageFilter> {
    return this.emailMessagesService.createSavedFilter(user.sub, body);
  }

  @Delete('saved-filters/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteSavedFilter(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<void> {
    return this.emailMessagesService.deleteSavedFilter(id, user.sub);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<EmailMessageDetail> {
    return this.emailMessagesService.getDetail(id);
  }

  @Get(':id/timeline')
  getTimeline(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(timelineQuerySchema))
    query: TimelineQueryDto,
  ): Promise<EmailMessageTimelineResponse> {
    return this.emailMessagesService.getTimeline(id, query.includeBotEvents);
  }

  @Post(':id/tags')
  addTag(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(assignMessageTagSchema))
    body: AssignMessageTagDto,
  ): Promise<EmailMessageDetail> {
    return this.emailMessagesService.addTag(id, body.tagId);
  }

  @Delete(':id/tags/:tagId')
  removeTag(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('tagId', ParseUUIDPipe) tagId: string,
  ): Promise<EmailMessageDetail> {
    return this.emailMessagesService.removeTag(id, tagId);
  }

  @Post('compose')
  @UseInterceptors(
    FilesInterceptor('attachments', 10, {
      storage: memoryStorage(),
      limits: { fileSize: MAX_TOTAL_ATTACHMENT_BYTES },
    }),
  )
  compose(
    @Body('payload') payload: string,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<ComposeSendResponse> {
    const dto = parseComposePayload(payload);
    return this.emailMessagesService.compose(
      dto,
      files ?? [],
      user.sub,
      user.role,
    );
  }

  @Post('test-send')
  testSend(
    @Body(new ZodValidationPipe(composeTestSendSchema))
    body: ComposeTestSendDto,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<ComposeTestSendResponse> {
    return this.emailMessagesService.testSend(body, user.email);
  }
}
