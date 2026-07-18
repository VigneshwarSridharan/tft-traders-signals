import { WebhookDispatchService } from './webhook-dispatch.service';
import { WebhookDeliveriesRepository } from '../database/webhook-deliveries.repository';
import { WebhookEndpointsRepository } from '../database/webhook-endpoints.repository';
import { WebhookDeliveryQueueService } from './webhook-delivery-queue.service';
import type { WebhookDeliveryRow, WebhookEndpointRow } from '../database/rows';

function buildEndpointRow(
  overrides: Partial<WebhookEndpointRow> = {},
): WebhookEndpointRow {
  return {
    id: 'endpoint-1',
    url: 'https://example.com/hook',
    secret_enc: Buffer.from('enc'),
    events: ['opened'],
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

function buildDeliveryRow(
  overrides: Partial<WebhookDeliveryRow> = {},
): WebhookDeliveryRow {
  return {
    id: 'delivery-1',
    endpoint_id: 'endpoint-1',
    event_type: 'opened',
    payload: {},
    attempt: 1,
    response_status: null,
    delivered_at: null,
    next_retry_at: null,
    created_at: new Date(),
    ...overrides,
  };
}

describe('WebhookDispatchService', () => {
  let webhookEndpointsRepository: jest.Mocked<WebhookEndpointsRepository>;
  let webhookDeliveriesRepository: jest.Mocked<WebhookDeliveriesRepository>;
  let webhookDeliveryQueueService: jest.Mocked<WebhookDeliveryQueueService>;
  let service: WebhookDispatchService;

  beforeEach(() => {
    webhookEndpointsRepository = {
      findActiveByEvent: jest.fn().mockResolvedValue([buildEndpointRow()]),
    } as unknown as jest.Mocked<WebhookEndpointsRepository>;
    webhookDeliveriesRepository = {
      create: jest.fn().mockResolvedValue(buildDeliveryRow()),
    } as unknown as jest.Mocked<WebhookDeliveriesRepository>;
    webhookDeliveryQueueService = {
      enqueue: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<WebhookDeliveryQueueService>;

    service = new WebhookDispatchService(
      webhookEndpointsRepository,
      webhookDeliveriesRepository,
      webhookDeliveryQueueService,
    );
  });

  it('creates a delivery row and enqueues a job for each active subscribed endpoint', async () => {
    await service.dispatch('opened', { messageId: 'message-1' });

    expect(webhookEndpointsRepository.findActiveByEvent).toHaveBeenCalledWith(
      'opened',
    );
    expect(webhookDeliveriesRepository.create).toHaveBeenCalledWith({
      endpointId: 'endpoint-1',
      eventType: 'opened',
      payload: { messageId: 'message-1' },
    });
    expect(webhookDeliveryQueueService.enqueue).toHaveBeenCalledWith({
      deliveryId: 'delivery-1',
      endpointId: 'endpoint-1',
      eventType: 'opened',
      data: { messageId: 'message-1' },
    });
  });

  it('does nothing when no endpoint is subscribed', async () => {
    webhookEndpointsRepository.findActiveByEvent.mockResolvedValue([]);

    await service.dispatch('opened', {});

    expect(webhookDeliveriesRepository.create).not.toHaveBeenCalled();
    expect(webhookDeliveryQueueService.enqueue).not.toHaveBeenCalled();
  });

  it('never throws, even if the repository blows up', async () => {
    webhookEndpointsRepository.findActiveByEvent.mockRejectedValue(
      new Error('db down'),
    );

    await expect(service.dispatch('opened', {})).resolves.toBeUndefined();
  });
});
