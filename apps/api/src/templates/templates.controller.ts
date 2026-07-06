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
import type {
  EmailTemplateSummary,
  MergeFieldOption,
  TemplatePreviewResponse,
  TemplateVersionSummary,
  TestSendTemplateResponse,
} from '@tft/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AccessTokenPayload } from '../auth/jwt-payload.interface';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { TemplatesService } from './templates.service';
import {
  createTemplateSchema,
  saveTemplateVersionSchema,
  templateListQuerySchema,
  templatePreviewSchema,
  testSendTemplateSchema,
  updateTemplateSchema,
  type CreateTemplateDto,
  type SaveTemplateVersionDto,
  type TemplateListQueryDto,
  type TemplatePreviewDto,
  type TestSendTemplateDto,
  type UpdateTemplateDto,
} from './dto/templates.schemas';

@Controller('templates')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(templateListQuerySchema))
    query: TemplateListQueryDto,
  ): Promise<EmailTemplateSummary[]> {
    return this.templatesService.list(query);
  }

  @Get('merge-fields')
  mergeFields(): Promise<MergeFieldOption[]> {
    return this.templatesService.mergeFields();
  }

  @Post('preview')
  previewAdHoc(
    @Body(new ZodValidationPipe(templatePreviewSchema))
    body: TemplatePreviewDto,
  ): Promise<TemplatePreviewResponse> {
    return this.templatesService.preview(null, body);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<EmailTemplateSummary> {
    return this.templatesService.get(id);
  }

  @Get(':id/versions')
  listVersions(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TemplateVersionSummary[]> {
    return this.templatesService.listVersions(id);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(createTemplateSchema)) body: CreateTemplateDto,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<EmailTemplateSummary> {
    return this.templatesService.create(body, user.sub);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateTemplateSchema)) body: UpdateTemplateDto,
  ): Promise<EmailTemplateSummary> {
    return this.templatesService.update(id, body);
  }

  @Post(':id/versions')
  saveVersion(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(saveTemplateVersionSchema))
    body: SaveTemplateVersionDto,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<EmailTemplateSummary> {
    return this.templatesService.saveNewVersion(id, body, user.sub);
  }

  @Post(':id/duplicate')
  duplicate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<EmailTemplateSummary> {
    return this.templatesService.duplicate(id, user.sub);
  }

  @Post(':id/preview')
  preview(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(templatePreviewSchema))
    body: TemplatePreviewDto,
  ): Promise<TemplatePreviewResponse> {
    return this.templatesService.preview(id, body);
  }

  @Post(':id/test-send')
  testSend(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(testSendTemplateSchema))
    body: TestSendTemplateDto,
  ): Promise<TestSendTemplateResponse> {
    return this.templatesService.testSend(id, body.to);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.templatesService.delete(id);
  }
}
