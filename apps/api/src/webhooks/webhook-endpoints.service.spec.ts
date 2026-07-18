import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebhookEndpointsService } from './webhook-endpoints.service';
import { decryptSecret } from '../common/crypto.util';
import { AuditLogsRepository } from '../database/audit-logs.repository';
import { WebhookDeliveriesRepository } from '../database/webhook-deliveries.repository';
import { WebhookEndpointsRepository } from '../database/webhook-endpoints.repository';
import { WebhookDeliveryQueueService } from './webhook-delivery-queue.service';
import type { EnvConfig } from '../config/env.validation';
import type { WebhookEndpointRow } from '../database/rows';

const ENCRYPTION_KEY = 'test-key-32-chars-minimum-000000';

function buildEndpointRow(
  overrides: Partial<WebhookEndpointRow> = {},
): WebhookEndpointRow {
  return {
    id: 'endpoint-1',
    url: 'https://example.com/hook',
    secret_enc: Buffer.from('enc'),
    events: ['sent'],
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

describe('WebhookEndpointsService', () => {
  let webhookEndpointsRepository: jest.Mocked<WebhookEndpointsRepository>;
  let webhookDeliveriesRepository: jest.Mocked<WebhookDeliveriesRepository>;
  let webhookDeliveryQueueService: jest.Mocked<WebhookDeliveryQueueService>;
  let auditLogsRepository: jest.Mocked<AuditLogsRepository>;
  let configService: ConfigService<EnvConfig, true>;
  let service: WebhookEndpointsService;

  beforeEach(() => {
    webhookEndpointsRepository = {
      create: jest.fn(),
      list: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      setActive: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<WebhookEndpointsRepository>;
    webhookDeliveriesRepository = {
      create: jest.fn(),
      listForEndpoint: jest.fn(),
    } as unknown as jest.Mocked<WebhookDeliveriesRepository>;
    webhookDeliveryQueueService = {
      enqueue: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<WebhookDeliveryQueueService>;
    auditLogsRepository = {
      record: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AuditLogsRepository>;
    configService = {
      get: jest.fn(() => ENCRYPTION_KEY),
    } as unknown as ConfigService<EnvConfig, true>;

    service = new WebhookEndpointsService(
      webhookEndpointsRepository,
      webhookDeliveriesRepository,
      webhookDeliveryQueueService,
      auditLogsRepository,
      configService,
    );
  });

  describe('create', () => {
    it('rejects a non-https, non-localhost URL', async () => {
      await expect(
        service.create(
          { url: 'http://example.com/hook', events: ['sent'] },
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
      expect(webhookEndpointsRepository.create).not.toHaveBeenCalled();
    });

    it('allows http://localhost for local testing', async () => {
      webhookEndpointsRepository.create.mockResolvedValue(
        buildEndpointRow({ url: 'http://localhost:4000/hook' }),
      );

      await expect(
        service.create(
          { url: 'http://localhost:4000/hook', events: ['sent'] },
          'user-1',
        ),
      ).resolves.toBeDefined();
    });

    it('encrypts a freshly generated secret and returns the raw value once, never persisting it in plaintext', async () => {
      webhookEndpointsRepository.create.mockImplementation((input) =>
        Promise.resolve(buildEndpointRow({ secret_enc: input.secretEnc })),
      );

      const result = await service.create(
        { url: 'https://example.com/hook', events: ['sent'] },
        'user-1',
      );

      expect(result.secret).toMatch(/^whsec_/);
      const persistedEnvelope =
        webhookEndpointsRepository.create.mock.calls[0][0].secretEnc;
      expect(decryptSecret(persistedEnvelope, ENCRYPTION_KEY)).toBe(
        result.secret,
      );
      expect(result).not.toHaveProperty('secret_enc');
      expect(auditLogsRepository.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'webhook_endpoint.create' }),
      );
    });
  });

  describe('update/delete', () => {
    it('throws NotFoundException for an unknown endpoint', async () => {
      webhookEndpointsRepository.findById.mockResolvedValue(null);
      await expect(
        service.update('missing', { isActive: false }, 'user-1'),
      ).rejects.toThrow(NotFoundException);
      await expect(service.delete('missing', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('audit-logs an update', async () => {
      webhookEndpointsRepository.findById.mockResolvedValue(buildEndpointRow());
      webhookEndpointsRepository.setActive.mockResolvedValue(
        buildEndpointRow({ is_active: false }),
      );

      await service.update('endpoint-1', { isActive: false }, 'user-1');

      expect(webhookEndpointsRepository.setActive).toHaveBeenCalledWith(
        'endpoint-1',
        false,
      );
      expect(auditLogsRepository.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'webhook_endpoint.update' }),
      );
    });

    it('audit-logs a delete', async () => {
      webhookEndpointsRepository.findById.mockResolvedValue(buildEndpointRow());

      await service.delete('endpoint-1', 'user-1');

      expect(webhookEndpointsRepository.delete).toHaveBeenCalledWith(
        'endpoint-1',
      );
      expect(auditLogsRepository.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'webhook_endpoint.delete' }),
      );
    });
  });

  describe('testSend', () => {
    it('enqueues a synthetic delivery bypassing the subscription filter', async () => {
      webhookEndpointsRepository.findById.mockResolvedValue(
        buildEndpointRow({ events: ['bounced'] }), // not subscribed to 'sent'
      );
      webhookDeliveriesRepository.create.mockResolvedValue({
        id: 'delivery-1',
        endpoint_id: 'endpoint-1',
        event_type: 'sent',
        payload: {},
        attempt: 1,
        response_status: null,
        delivered_at: null,
        next_retry_at: null,
        created_at: new Date(),
      });

      await service.testSend('endpoint-1');

      expect(webhookDeliveriesRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          endpointId: 'endpoint-1',
          eventType: 'sent',
        }),
      );
      expect(webhookDeliveryQueueService.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          endpointId: 'endpoint-1',
          eventType: 'sent',
        }),
      );
    });
  });
});
