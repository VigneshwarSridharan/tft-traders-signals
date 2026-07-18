import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { EmailMessageSummary, SentMailListResponse } from '@tft/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireScopes } from '../auth/decorators/scopes.decorator';
import { ApiKeyAuthGuard } from '../auth/guards/api-key-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ScopesGuard } from '../auth/guards/scopes.guard';
import type { AccessTokenPayload } from '../auth/jwt-payload.interface';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { EmailMessagesService } from '../email-messages/email-messages.service';
import {
  sentMailListQuerySchema,
  type SentMailListQueryDto,
} from '../sent-mail/dto/sent-mail.schemas';
import { SentMailService } from '../sent-mail/sent-mail.service';
import { ApiKeyRateLimitGuard } from './api-key-rate-limit.guard';

@Controller('v1/messages')
@UseGuards(ApiKeyAuthGuard, RolesGuard, ScopesGuard, ApiKeyRateLimitGuard)
@RequireScopes('read:messages')
export class PublicApiMessagesController {
  constructor(
    private readonly emailMessagesService: EmailMessagesService,
    private readonly sentMailService: SentMailService,
  ) {}

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
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<EmailMessageSummary> {
    return this.emailMessagesService.get(id, user.sub, user.role);
  }
}
