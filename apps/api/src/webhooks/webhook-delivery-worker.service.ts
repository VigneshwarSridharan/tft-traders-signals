import { createHmac } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Job } from 'bullmq';
import type { EnvConfig } from '../config/env.validation';
import { decryptSecret } from '../common/crypto.util';
import { AuditLogsRepository } from '../database/audit-logs.repository';
import { WebhookDeliveriesRepository } from '../database/webhook-deliveries.repository';
import { WebhookEndpointsRepository } from '../database/webhook-endpoints.repository';
import { NotificationsService } from '../notifications/notifications.service';
import type { WebhookDeliveryJobData } from './webhook-delivery-queue.service';

const DELIVERY_TIMEOUT_MS = 10_000;

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown delivery error';
}

/** Approximates BullMQ's own exponential backoff, for the dashboard's `next_retry_at` display only. */
function computeNextRetryAt(job: Job<WebhookDeliveryJobData>): Date {
  const backoff = job.opts.backoff;
  const baseDelay =
    typeof backoff === 'object' && backoff !== null ? backoff.delay : 60_000;
  const delayMs = (baseDelay ?? 60_000) * 2 ** job.attemptsMade;
  return new Date(Date.now() + delayMs);
}

@Injectable()
export class WebhookDeliveryWorkerService {
  private readonly logger = new Logger(WebhookDeliveryWorkerService.name);

  constructor(
    private readonly webhookEndpointsRepository: WebhookEndpointsRepository,
    private readonly webhookDeliveriesRepository: WebhookDeliveriesRepository,
    private readonly auditLogsRepository: AuditLogsRepository,
    private readonly notificationsService: NotificationsService,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  async processDeliveryJob(job: Job<WebhookDeliveryJobData>): Promise<void> {
    const { deliveryId, endpointId, eventType, data } = job.data;

    const endpoint = await this.webhookEndpointsRepository.findById(endpointId);
    if (!endpoint || !endpoint.is_active) {
      // The endpoint was deleted or disabled after this job was enqueued —
      // nothing left to deliver to.
      return;
    }

    const envelope = {
      id: deliveryId,
      event: eventType,
      createdAt: new Date().toISOString(),
      data,
    };
    const body = JSON.stringify(envelope);
    const secret = decryptSecret(
      endpoint.secret_enc,
      this.configService.get('APP_ENCRYPTION_KEY', { infer: true }),
    );
    const signature = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

    let responseStatus: number | null = null;
    let ok = false;
    try {
      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Event': eventType,
          'X-Webhook-Id': deliveryId,
        },
        body,
        signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
      });
      responseStatus = response.status;
      ok = response.ok;
    } catch (error) {
      this.logger.warn(
        `Webhook delivery ${deliveryId} to ${endpoint.url} failed: ${toErrorMessage(error)}`,
      );
    }

    if (ok) {
      await this.webhookDeliveriesRepository.markDelivered(
        deliveryId,
        responseStatus as number,
        new Date(),
      );
      return;
    }

    const attempt = job.attemptsMade + 1;
    const isFinalAttempt = attempt >= (job.opts.attempts ?? 1);

    if (!isFinalAttempt) {
      await this.webhookDeliveriesRepository.markRetrying(
        deliveryId,
        responseStatus,
        computeNextRetryAt(job),
        attempt,
      );
      throw new Error(
        `Webhook delivery ${deliveryId} failed (status ${responseStatus ?? 'network error'}); will retry`,
      );
    }

    await this.webhookDeliveriesRepository.markFailed(
      deliveryId,
      responseStatus,
      attempt,
    );
    await this.maybeAutoDisable(endpointId, endpoint.url);
  }

  private async maybeAutoDisable(
    endpointId: string,
    endpointUrl: string,
  ): Promise<void> {
    const threshold = this.configService.get('WEBHOOK_AUTO_DISABLE_THRESHOLD', {
      infer: true,
    });
    const consecutiveFailures =
      await this.webhookDeliveriesRepository.countRecentConsecutiveFailures(
        endpointId,
        threshold,
      );
    if (consecutiveFailures < threshold) {
      return;
    }

    await this.webhookEndpointsRepository.setActive(endpointId, false);
    await this.auditLogsRepository.record({
      userId: null,
      action: 'webhook_endpoint.auto_disabled',
      entityType: 'webhook_endpoint',
      entityId: endpointId,
      metadata: { url: endpointUrl, consecutiveFailures },
    });
    await this.notificationsService.notifyAdmins({
      type: 'webhook_disabled',
      title: `Webhook endpoint ${endpointUrl} was automatically disabled`,
      body: `${consecutiveFailures} consecutive deliveries failed. Re-enable it from the Webhooks page once the issue is fixed.`,
    });
  }
}
