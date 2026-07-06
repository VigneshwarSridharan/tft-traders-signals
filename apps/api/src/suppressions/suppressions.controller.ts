import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { SuppressionSummary } from '@tft/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AccessTokenPayload } from '../auth/jwt-payload.interface';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  createSuppressionSchema,
  type CreateSuppressionDto,
} from './dto/suppressions.schemas';
import { SuppressionsService } from './suppressions.service';

@Controller('suppressions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class SuppressionsController {
  constructor(private readonly suppressionsService: SuppressionsService) {}

  @Get()
  list(): Promise<SuppressionSummary[]> {
    return this.suppressionsService.list();
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(createSuppressionSchema))
    body: CreateSuppressionDto,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<SuppressionSummary> {
    return this.suppressionsService.create(body, user.sub);
  }

  @Post(':id/release')
  release(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<SuppressionSummary> {
    return this.suppressionsService.release(id, user.sub);
  }
}
