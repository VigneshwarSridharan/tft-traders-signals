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
  UseGuards,
} from '@nestjs/common';
import type { ApiKeySummary, CreateApiKeyResponse } from '@tft/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AccessTokenPayload } from '../auth/jwt-payload.interface';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ApiKeysService } from './api-keys.service';
import {
  createApiKeySchema,
  type CreateApiKeyDto,
} from './dto/api-keys.schemas';

/**
 * Dashboard-facing CRUD for a user's own public API keys (any authenticated
 * role — admins additionally see everyone's keys). Distinct from
 * apps/api/src/public-api, which is the API-key-authenticated `/v1/*`
 * surface those keys unlock.
 */
@Controller('api-keys')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Get()
  list(@CurrentUser() user: AccessTokenPayload): Promise<ApiKeySummary[]> {
    return this.apiKeysService.list(user);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(createApiKeySchema)) body: CreateApiKeyDto,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<CreateApiKeyResponse> {
    return this.apiKeysService.create(user, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  revoke(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<void> {
    return this.apiKeysService.revoke(id, user);
  }
}
