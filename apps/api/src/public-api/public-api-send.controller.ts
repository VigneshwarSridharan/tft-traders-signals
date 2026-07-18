import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import type { ComposeSendResponse } from '@tft/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireScopes } from '../auth/decorators/scopes.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ApiKeyAuthGuard } from '../auth/guards/api-key-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ScopesGuard } from '../auth/guards/scopes.guard';
import type { AccessTokenPayload } from '../auth/jwt-payload.interface';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  composeSendSchema,
  type ComposeSendDto,
} from '../email-messages/dto/email-messages.schemas';
import { EmailMessagesService } from '../email-messages/email-messages.service';
import { ApiKeyRateLimitGuard } from './api-key-rate-limit.guard';

/**
 * Attachments aren't supported via the public API yet — compose is called
 * with an empty attachments array, same as the dashboard's compose endpoint
 * minus the multipart file upload.
 */
@Controller('v1')
@UseGuards(ApiKeyAuthGuard, RolesGuard, ScopesGuard, ApiKeyRateLimitGuard)
export class PublicApiSendController {
  constructor(private readonly emailMessagesService: EmailMessagesService) {}

  @Post('send')
  @Roles('admin', 'manager', 'agent')
  @RequireScopes('send')
  send(
    @Body(new ZodValidationPipe(composeSendSchema)) body: ComposeSendDto,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<ComposeSendResponse> {
    return this.emailMessagesService.compose(body, [], user.sub, user.role);
  }
}
