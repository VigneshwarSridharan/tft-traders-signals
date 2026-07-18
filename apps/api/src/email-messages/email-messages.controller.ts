import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
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
  EmailMessageSummary,
  FollowUpDraftResponse,
} from '@tft/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AccessTokenPayload } from '../auth/jwt-payload.interface';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { MAX_TOTAL_ATTACHMENT_BYTES } from './attachment-storage.util';
import {
  composeTestSendSchema,
  parseComposePayload,
  type ComposeTestSendDto,
} from './dto/email-messages.schemas';
import { EmailMessagesService } from './email-messages.service';

@Controller('email-messages')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EmailMessagesController {
  constructor(private readonly emailMessagesService: EmailMessagesService) {}

  @Get('sender-accounts')
  listSenderAccounts(): Promise<ComposeSenderAccountOption[]> {
    return this.emailMessagesService.listSenderAccountOptions();
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<EmailMessageSummary> {
    return this.emailMessagesService.get(id);
  }

  @Get(':id/follow-up-draft')
  getFollowUpDraft(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<FollowUpDraftResponse> {
    return this.emailMessagesService.getFollowUpDraft(id);
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
