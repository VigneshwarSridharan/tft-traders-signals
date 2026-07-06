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
import type { ComposeSendResponse, EmailMessageSummary } from '@tft/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AccessTokenPayload } from '../auth/jwt-payload.interface';
import { MAX_TOTAL_ATTACHMENT_BYTES } from './attachment-storage.util';
import { parseComposePayload } from './dto/email-messages.schemas';
import { EmailMessagesService } from './email-messages.service';

@Controller('email-messages')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EmailMessagesController {
  constructor(private readonly emailMessagesService: EmailMessagesService) {}

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<EmailMessageSummary> {
    return this.emailMessagesService.get(id);
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
}
