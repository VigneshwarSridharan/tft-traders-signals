import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import type {
  ComplianceSettings,
  PlatformSettings,
  RetentionSettings,
} from '@tft/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AccessTokenPayload } from '../auth/jwt-payload.interface';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  updateComplianceSettingsSchema,
  updateRetentionSettingsSchema,
  type UpdateComplianceSettingsDto,
  type UpdateRetentionSettingsDto,
} from './dto/settings.schemas';
import { SettingsService } from './settings.service';

@Controller('settings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  getAll(): Promise<PlatformSettings> {
    return this.settingsService.getAll();
  }

  @Patch('compliance')
  updateCompliance(
    @Body(new ZodValidationPipe(updateComplianceSettingsSchema))
    body: UpdateComplianceSettingsDto,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<ComplianceSettings> {
    return this.settingsService.updateCompliance(body, user.sub);
  }

  @Patch('retention')
  updateRetention(
    @Body(new ZodValidationPipe(updateRetentionSettingsSchema))
    body: UpdateRetentionSettingsDto,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<RetentionSettings> {
    return this.settingsService.updateRetention(body, user.sub);
  }
}
