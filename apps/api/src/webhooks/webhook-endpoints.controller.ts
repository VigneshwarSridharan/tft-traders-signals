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
  CreateWebhookEndpointResponse,
  WebhookDeliveryListResponse,
  WebhookEndpointSummary,
} from '@tft/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AccessTokenPayload } from '../auth/jwt-payload.interface';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { WebhookEndpointsService } from './webhook-endpoints.service';
import {
  createWebhookEndpointSchema,
  listWebhookDeliveriesQuerySchema,
  updateWebhookEndpointSchema,
  type CreateWebhookEndpointDto,
  type ListWebhookDeliveriesQueryDto,
  type UpdateWebhookEndpointDto,
} from './dto/webhooks.schemas';

@Controller('webhook-endpoints')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class WebhookEndpointsController {
  constructor(
    private readonly webhookEndpointsService: WebhookEndpointsService,
  ) {}

  @Get()
  list(): Promise<WebhookEndpointSummary[]> {
    return this.webhookEndpointsService.list();
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<WebhookEndpointSummary> {
    return this.webhookEndpointsService.get(id);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(createWebhookEndpointSchema))
    body: CreateWebhookEndpointDto,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<CreateWebhookEndpointResponse> {
    return this.webhookEndpointsService.create(body, user.sub);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateWebhookEndpointSchema))
    body: UpdateWebhookEndpointDto,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<WebhookEndpointSummary> {
    return this.webhookEndpointsService.update(id, body, user.sub);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<void> {
    return this.webhookEndpointsService.delete(id, user.sub);
  }

  @Get(':id/deliveries')
  listDeliveries(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(listWebhookDeliveriesQuerySchema))
    query: ListWebhookDeliveriesQueryDto,
  ): Promise<WebhookDeliveryListResponse> {
    return this.webhookEndpointsService
      .listDeliveries(id, query)
      .then(({ items, total }) => ({
        items,
        total,
        page: query.page,
        pageSize: query.pageSize,
      }));
  }

  @Post(':id/test-send')
  @HttpCode(HttpStatus.ACCEPTED)
  testSend(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.webhookEndpointsService.testSend(id);
  }
}
