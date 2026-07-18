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
  Query,
  UseGuards,
} from '@nestjs/common';
import type { EmailTemplateSummary } from '@tft/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireScopes } from '../auth/decorators/scopes.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ApiKeyAuthGuard } from '../auth/guards/api-key-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ScopesGuard } from '../auth/guards/scopes.guard';
import type { AccessTokenPayload } from '../auth/jwt-payload.interface';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  createTemplateSchema,
  templateListQuerySchema,
  updateTemplateSchema,
  type CreateTemplateDto,
  type TemplateListQueryDto,
  type UpdateTemplateDto,
} from '../templates/dto/templates.schemas';
import { TemplatesService } from '../templates/templates.service';
import { ApiKeyRateLimitGuard } from './api-key-rate-limit.guard';

/**
 * Reuses TemplatesService/its zod schemas exactly as TemplatesController
 * does. Only the CRUD subset (list/get/create/update/delete) is exposed
 * here — versioning, duplication, preview, and test-send stay dashboard-only
 * for now.
 */
@Controller('v1/templates')
@UseGuards(ApiKeyAuthGuard, RolesGuard, ScopesGuard, ApiKeyRateLimitGuard)
export class PublicApiTemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Get()
  @RequireScopes('read:templates')
  list(
    @Query(new ZodValidationPipe(templateListQuerySchema))
    query: TemplateListQueryDto,
  ): Promise<EmailTemplateSummary[]> {
    return this.templatesService.list(query);
  }

  @Get(':id')
  @RequireScopes('read:templates')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<EmailTemplateSummary> {
    return this.templatesService.get(id);
  }

  @Post()
  @Roles('admin', 'manager')
  @RequireScopes('write:templates')
  create(
    @Body(new ZodValidationPipe(createTemplateSchema)) body: CreateTemplateDto,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<EmailTemplateSummary> {
    return this.templatesService.create(body, user.sub);
  }

  @Patch(':id')
  @Roles('admin', 'manager')
  @RequireScopes('write:templates')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateTemplateSchema)) body: UpdateTemplateDto,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<EmailTemplateSummary> {
    return this.templatesService.update(id, body, user.sub);
  }

  @Delete(':id')
  @Roles('admin', 'manager')
  @RequireScopes('write:templates')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<void> {
    return this.templatesService.delete(id, user.sub);
  }
}
