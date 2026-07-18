import type { ConfigService } from '@nestjs/config';
import type { RealtimeTrackingEvent } from '@tft/shared';
import { RealtimeEventsService } from './realtime-events.service';
import { EmailMessagesRepository } from '../database/email-messages.repository';
import type { EmailMessageRow } from '../database/rows';
import type { EnvConfig } from '../config/env.validation';

type Handler = (...args: unknown[]) => void;

class FakeClient {
  handlers = new Map<string, Handler[]>();
  connect = jest.fn().mockResolvedValue(undefined);
  query = jest.fn().mockResolvedValue(undefined);
  end = jest.fn().mockResolvedValue(undefined);

  on(event: string, handler: Handler): this {
    const list = this.handlers.get(event) ?? [];
    list.push(handler);
    this.handlers.set(event, list);
    return this;
  }

  emit(event: string, ...args: unknown[]): void {
    for (const handler of this.handlers.get(event) ?? []) {
      handler(...args);
    }
  }
}

let latestFakeClient!: FakeClient;

jest.mock('pg', () => ({
  Client: jest.fn().mockImplementation(() => {
    latestFakeClient = new FakeClient();
    return latestFakeClient;
  }),
}));

function buildMessageRow(
  overrides: Partial<EmailMessageRow> = {},
): EmailMessageRow {
  return {
    id: 'message-1',
    public_token: 'pub-token',
    sender_account_id: 'sender-1',
    customer_id: 'customer-1',
    template_version_id: null,
    sent_by: 'user-1',
    to_email: 'jane@acme.com',
    to_name: 'Jane Doe',
    subject: 'Your quote',
    body_html_rendered: '<p>Hi</p>',
    body_text_rendered: 'Hi',
    message_id_header: '<abc@test.local>',
    tracking_enabled: true,
    status: 'sent',
    smtp_response: '250 OK',
    queued_at: new Date('2026-07-01T12:00:00Z'),
    sent_at: new Date('2026-07-01T12:00:05Z'),
    open_count: 0,
    unique_open_hint: false,
    first_opened_at: null,
    last_opened_at: null,
    click_count: 0,
    first_clicked_at: null,
    last_clicked_at: null,
    replied_at: null,
    bounce_type: 'none',
    unsubscribed_at: null,
    parent_message_id: null,
    in_reply_to_header: null,
    references_header: null,
    follow_up_days: null,
    follow_up_notified_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

describe('RealtimeEventsService', () => {
  let configService: jest.Mocked<ConfigService<EnvConfig, true>>;
  let emailMessagesRepository: jest.Mocked<EmailMessagesRepository>;
  let service: RealtimeEventsService;

  beforeEach(() => {
    configService = {
      get: jest.fn().mockReturnValue('postgresql://test/test'),
    } as unknown as jest.Mocked<ConfigService<EnvConfig, true>>;
    emailMessagesRepository = {
      findById: jest.fn(),
    } as unknown as jest.Mocked<EmailMessagesRepository>;
    service = new RealtimeEventsService(configService, emailMessagesRepository);
  });

  afterEach(async () => {
    await service.onModuleDestroy();
    jest.useRealTimers();
  });

  it('LISTENs on the tracking_events channel on start', async () => {
    await service.start();

    expect(latestFakeClient.connect).toHaveBeenCalled();
    expect(latestFakeClient.query).toHaveBeenCalledWith(
      'LISTEN tracking_events',
    );
  });

  it('enriches a notification into a RealtimeTrackingEvent and publishes it', async () => {
    emailMessagesRepository.findById.mockResolvedValue(
      buildMessageRow({ open_count: 1 }),
    );
    const received: RealtimeTrackingEvent[] = [];
    service.events$.subscribe((event) => received.push(event));

    await service.start();
    latestFakeClient.emit('notification', {
      channel: 'tracking_events',
      payload: JSON.stringify({
        eventId: 'evt-1',
        messageId: 'message-1',
        eventType: 'open',
        occurredAt: '2026-07-17T00:00:00.000Z',
      }),
    });
    await flushMicrotasks();

    expect(emailMessagesRepository.findById).toHaveBeenCalledWith('message-1');
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      messageId: 'message-1',
      eventType: 'open',
      toEmail: 'jane@acme.com',
      subject: 'Your quote',
      openCount: 1,
      isFirstOpen: true,
      isFirstClick: false,
    });
  });

  it('ignores notifications on unrelated channels', async () => {
    const received: RealtimeTrackingEvent[] = [];
    service.events$.subscribe((event) => received.push(event));

    await service.start();
    latestFakeClient.emit('notification', {
      channel: 'some_other_channel',
      payload: JSON.stringify({
        messageId: 'message-1',
        eventType: 'open',
        occurredAt: '2026-07-17T00:00:00.000Z',
      }),
    });
    await flushMicrotasks();

    expect(emailMessagesRepository.findById).not.toHaveBeenCalled();
    expect(received).toHaveLength(0);
  });

  it('drops a notification for a message that no longer exists', async () => {
    emailMessagesRepository.findById.mockResolvedValue(null);
    const received: RealtimeTrackingEvent[] = [];
    service.events$.subscribe((event) => received.push(event));

    await service.start();
    latestFakeClient.emit('notification', {
      channel: 'tracking_events',
      payload: JSON.stringify({
        messageId: 'missing',
        eventType: 'click',
        occurredAt: '2026-07-17T00:00:00.000Z',
      }),
    });
    await flushMicrotasks();

    expect(received).toHaveLength(0);
  });

  it('reconnects with a fresh client after a connection error', async () => {
    jest.useFakeTimers();
    await service.start();
    const firstClient = latestFakeClient;

    firstClient.emit('error', new Error('connection reset'));
    await jest.advanceTimersByTimeAsync(5_000);

    expect(latestFakeClient).not.toBe(firstClient);
    expect(latestFakeClient.connect).toHaveBeenCalled();
  });
});

async function flushMicrotasks(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}
