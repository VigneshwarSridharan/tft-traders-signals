import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  CreateWebhookEndpointResponse,
  WebhookDeliverySummary,
  WebhookEndpointSummary,
} from '@tft/shared';
import type { EnvConfig } from '../config/env.validation';
import { encryptSecret } from '../common/crypto.util';
import { generateWebhookSecret } from '../common/id.util';
import { AuditLogsRepository } from '../database/audit-logs.repository';
import { WebhookDeliveriesRepository } from '../database/webhook-deliveries.repository';
import { WebhookEndpointsRepository } from '../database/webhook-endpoints.repository';
import { WebhookDeliveryQueueService } from './webhook-delivery-queue.service';
import {
  toWebhookDeliverySummary,
  toWebhookEndpointSummary,
} from './webhooks.mapper';
import type {
  CreateWebhookEndpointDto,
  ListWebhookDeliveriesQueryDto,
  UpdateWebhookEndpointDto,
} from './dto/webhooks.schemas';

function assertHttpsUrl(url: string): void {
  const parsed = new URL(url);
  const isLocalhost =
    parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  if (
    parsed.protocol !== 'https:' &&
    !(parsed.protocol === 'http:' && isLocalhost)
  ) {
    throw new BadRequestException(
      'Webhook endpoint URL must use https:// (http:// is only allowed for localhost, for local testing)',
    );
  }
}

@Injectable()
export class WebhookEndpointsService {
  constructor(
    private readonly webhookEndpointsRepository: WebhookEndpointsRepository,
    private readonly webhookDeliveriesRepository: WebhookDeliveriesRepository,
    private readonly webhookDeliveryQueueService: WebhookDeliveryQueueService,
    private readonly auditLogsRepository: AuditLogsRepository,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  async create(
    dto: CreateWebhookEndpointDto,
    currentUserId: string,
  ): Promise<CreateWebhookEndpointResponse> {
    assertHttpsUrl(dto.url);

    const secret = generateWebhookSecret();
    const secretEnc = encryptSecret(
      secret,
      this.configService.get('APP_ENCRYPTION_KEY', { infer: true }),
    );
    const row = await this.webhookEndpointsRepository.create({
      url: dto.url,
      secretEnc,
      events: dto.events,
    });

    await this.auditLogsRepository.record({
      userId: currentUserId,
      action: 'webhook_endpoint.create',
      entityType: 'webhook_endpoint',
      entityId: row.id,
      metadata: { url: row.url, events: row.events },
    });

    return { ...toWebhookEndpointSummary(row), secret };
  }

  async list(): Promise<WebhookEndpointSummary[]> {
    const rows = await this.webhookEndpointsRepository.list();
    return rows.map(toWebhookEndpointSummary);
  }

  async get(id: string): Promise<WebhookEndpointSummary> {
    const row = await this.webhookEndpointsRepository.findById(id);
    if (!row) {
      throw new NotFoundException('Webhook endpoint not found');
    }
    return toWebhookEndpointSummary(row);
  }

  async update(
    id: string,
    dto: UpdateWebhookEndpointDto,
    currentUserId: string,
  ): Promise<WebhookEndpointSummary> {
    const existing = await this.webhookEndpointsRepository.findById(id);
    if (!existing) {
      throw new NotFoundException('Webhook endpoint not found');
    }
    if (dto.url) {
      assertHttpsUrl(dto.url);
    }

    let row = existing;
    if (dto.url !== undefined || dto.events !== undefined) {
      row =
        (await this.webhookEndpointsRepository.update(id, {
          url: dto.url,
          events: dto.events,
        })) ?? existing;
    }
    if (dto.isActive !== undefined) {
      row =
        (await this.webhookEndpointsRepository.setActive(id, dto.isActive)) ??
        row;
    }

    await this.auditLogsRepository.record({
      userId: currentUserId,
      action: 'webhook_endpoint.update',
      entityType: 'webhook_endpoint',
      entityId: id,
      metadata: { url: row.url, events: row.events, isActive: row.is_active },
    });

    return toWebhookEndpointSummary(row);
  }

  async delete(id: string, currentUserId: string): Promise<void> {
    const existing = await this.webhookEndpointsRepository.findById(id);
    if (!existing) {
      throw new NotFoundException('Webhook endpoint not found');
    }
    await this.webhookEndpointsRepository.delete(id);

    await this.auditLogsRepository.record({
      userId: currentUserId,
      action: 'webhook_endpoint.delete',
      entityType: 'webhook_endpoint',
      entityId: id,
      metadata: { url: existing.url },
    });
  }

  async listDeliveries(
    endpointId: string,
    query: ListWebhookDeliveriesQueryDto,
  ): Promise<{ items: WebhookDeliverySummary[]; total: number }> {
    const existing = await this.webhookEndpointsRepository.findById(endpointId);
    if (!existing) {
      throw new NotFoundException('Webhook endpoint not found');
    }
    const { rows, total } =
      await this.webhookDeliveriesRepository.listForEndpoint(endpointId, {
        page: query.page,
        pageSize: query.pageSize,
      });
    return { items: rows.map(toWebhookDeliverySummary), total };
  }

  /**
   * Fires a synthetic test delivery through the same queue/worker path as a
   * real dispatch, bypassing the "endpoint must be subscribed to this
   * event" filter since this is an explicit, admin-initiated test.
   */
  async testSend(endpointId: string): Promise<void> {
    const endpoint = await this.webhookEndpointsRepository.findById(endpointId);
    if (!endpoint) {
      throw new NotFoundException('Webhook endpoint not found');
    }

    const data = { test: true, message: 'This is a test webhook delivery' };
    const delivery = await this.webhookDeliveriesRepository.create({
      endpointId: endpoint.id,
      eventType: 'sent',
      payload: data,
    });
    await this.webhookDeliveryQueueService.enqueue({
      deliveryId: delivery.id,
      endpointId: endpoint.id,
      eventType: 'sent',
      data,
    });
  }
}
