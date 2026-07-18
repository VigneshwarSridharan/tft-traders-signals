import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import type { AuditLogListResponse } from '@tft/shared';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuditLogsService } from './audit-logs.service';
import {
  auditLogListQuerySchema,
  type AuditLogListQueryDto,
} from './dto/audit-logs.schemas';

@Controller('audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(auditLogListQuerySchema))
    query: AuditLogListQueryDto,
  ): Promise<AuditLogListResponse> {
    return this.auditLogsService.list(query);
  }
}
