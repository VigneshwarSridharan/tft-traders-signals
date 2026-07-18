import { createHmac } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import type { Job } from 'bullmq';
import { WebhookDeliveryWorkerService } from './webhook-delivery-worker.service';
import { encryptSecret } from '../common/crypto.util';
import { AuditLogsRepository } from '../database/audit-logs.repository';
import { WebhookDeliveriesRepository } from '../database/webhook-deliveries.repository';
import { WebhookEndpointsRepository } from '../database/webhook-endpoints.repository';
import { NotificationsService } from '../notifications/notifications.service';
import type { EnvConfig } from '../config/env.validation';
import type { WebhookEndpointRow } from '../database/rows';
import type { WebhookDeliveryJobData } from './webhook-delivery-queue.service';

const ENCRYPTION_KEY = 'test-key-32-chars-minimum-000000';
const WEBHOOK_SECRET = 'whsec_test_secret';

function buildEndpointRow(
  overrides: Partial<WebhookEndpointRow> = {},
): WebhookEndpointRow {
  return {
    id: 'endpoint-1',
    url: 'https://example.com/hook',
    secret_enc: encryptSecret(WEBHOOK_SECRET, ENCRYPTION_KEY),
    events: ['opened'],
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

function buildJob(
  overrides: Partial<Job<WebhookDeliveryJobData>> = {},
): Job<WebhookDeliveryJobData> {
  return {
    data: {
      deliveryId: 'delivery-1',
      endpointId: 'endpoint-1',
      eventType: 'opened',
      data: { messageId: 'message-1' },
    },
    attemptsMade: 0,
    opts: { attempts: 5, backoff: { type: 'exponential', delay: 60_000 } },
    ...overrides,
  } as unknown as Job<WebhookDeliveryJobData>;
}

describe('WebhookDeliveryWorkerService', () => {
  let webhookEndpointsRepository: jest.Mocked<WebhookEndpointsRepository>;
  let webhookDeliveriesRepository: jest.Mocked<WebhookDeliveriesRepository>;
  let auditLogsRepository: jest.Mocked<AuditLogsRepository>;
  let notificationsService: jest.Mocked<NotificationsService>;
  let configService: ConfigService<EnvConfig, true>;
  let service: WebhookDeliveryWorkerService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    webhookEndpointsRepository = {
      findById: jest.fn().mockResolvedValue(buildEndpointRow()),
      setActive: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<WebhookEndpointsRepository>;
    webhookDeliveriesRepository = {
      markDelivered: jest.fn().mockResolvedValue(undefined),
      markRetrying: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn().mockResolvedValue(undefined),
      countRecentConsecutiveFailures: jest.fn().mockResolvedValue(0),
    } as unknown as jest.Mocked<WebhookDeliveriesRepository>;
    auditLogsRepository = {
      record: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AuditLogsRepository>;
    notificationsService = {
      notifyAdmins: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<NotificationsService>;
    configService = {
      get: jest.fn((key: string) => {
        if (key === 'APP_ENCRYPTION_KEY') return ENCRYPTION_KEY;
        if (key === 'WEBHOOK_AUTO_DISABLE_THRESHOLD') return 10;
        return undefined;
      }),
    } as unknown as ConfigService<EnvConfig, true>;

    fetchMock = jest.fn();
    global.fetch = fetchMock;

    service = new WebhookDeliveryWorkerService(
      webhookEndpointsRepository,
      webhookDeliveriesRepository,
      auditLogsRepository,
      notificationsService,
      configService,
    );
  });

  it('skips (no-ops) when the endpoint no longer exists', async () => {
    webhookEndpointsRepository.findById.mockResolvedValue(null);

    await service.processDeliveryJob(buildJob());

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips when the endpoint has gone inactive since enqueue', async () => {
    webhookEndpointsRepository.findById.mockResolvedValue(
      buildEndpointRow({ is_active: false }),
    );

    await service.processDeliveryJob(buildJob());

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('signs the payload with the decrypted secret and marks delivered on a 2xx response', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });

    await service.processDeliveryJob(buildJob());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://example.com/hook');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Webhook-Event']).toBe('opened');
    expect(headers['X-Webhook-Id']).toBe('delivery-1');

    const expectedSignature = `sha256=${createHmac('sha256', WEBHOOK_SECRET)
      .update(init.body as string)
      .digest('hex')}`;
    expect(headers['X-Webhook-Signature']).toBe(expectedSignature);

    const envelope = JSON.parse(init.body as string) as {
      id: string;
      event: string;
      data: unknown;
    };
    expect(envelope.id).toBe('delivery-1');
    expect(envelope.event).toBe('opened');
    expect(envelope.data).toEqual({ messageId: 'message-1' });

    expect(webhookDeliveriesRepository.markDelivered).toHaveBeenCalledWith(
      'delivery-1',
      200,
      expect.any(Date),
    );
  });

  it('marks retrying and rethrows on a non-final failed attempt', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    await expect(
      service.processDeliveryJob(buildJob({ attemptsMade: 0 })),
    ).rejects.toThrow();

    expect(webhookDeliveriesRepository.markRetrying).toHaveBeenCalledWith(
      'delivery-1',
      500,
      expect.any(Date),
      1,
    );
    expect(webhookDeliveriesRepository.markFailed).not.toHaveBeenCalled();
  });

  it('marks failed (terminal) without rethrowing on the final attempt', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    await service.processDeliveryJob(
      buildJob({ attemptsMade: 4, opts: { attempts: 5 } }),
    );

    expect(webhookDeliveriesRepository.markFailed).toHaveBeenCalledWith(
      'delivery-1',
      500,
      5,
    );
  });

  it('auto-disables the endpoint and notifies admins once the failure threshold is reached', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    webhookDeliveriesRepository.countRecentConsecutiveFailures.mockResolvedValue(
      10,
    );

    await service.processDeliveryJob(
      buildJob({ attemptsMade: 4, opts: { attempts: 5 } }),
    );

    expect(webhookEndpointsRepository.setActive).toHaveBeenCalledWith(
      'endpoint-1',
      false,
    );
    expect(auditLogsRepository.record).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: null,
        action: 'webhook_endpoint.auto_disabled',
      }),
    );
    expect(notificationsService.notifyAdmins).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'webhook_disabled' }),
    );
  });

  it('does not auto-disable when failures are below the threshold', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    webhookDeliveriesRepository.countRecentConsecutiveFailures.mockResolvedValue(
      3,
    );

    await service.processDeliveryJob(
      buildJob({ attemptsMade: 4, opts: { attempts: 5 } }),
    );

    expect(webhookEndpointsRepository.setActive).not.toHaveBeenCalled();
    expect(notificationsService.notifyAdmins).not.toHaveBeenCalled();
  });

  it('treats a network error (fetch rejection) the same as a failed response', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    await service.processDeliveryJob(
      buildJob({ attemptsMade: 4, opts: { attempts: 5 } }),
    );

    expect(webhookDeliveriesRepository.markFailed).toHaveBeenCalledWith(
      'delivery-1',
      null,
      5,
    );
  });
});
