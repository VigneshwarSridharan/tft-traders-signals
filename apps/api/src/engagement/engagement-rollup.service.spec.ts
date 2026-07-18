import { EngagementRollupService } from './engagement-rollup.service';
import { CustomersRepository } from '../database/customers.repository';
import { EmailMessagesRepository } from '../database/email-messages.repository';
import { NotificationsService } from '../notifications/notifications.service';
import type { EmailMessageRow } from '../database/rows';

function buildDueMessage(
  overrides: Partial<EmailMessageRow> = {},
): EmailMessageRow {
  return {
    id: 'message-1',
    public_token: 'token',
    sender_account_id: 'sender-1',
    customer_id: 'customer-1',
    template_version_id: null,
    sent_by: 'user-1',
    to_email: 'jane@acme.com',
    to_name: 'Jane Doe',
    subject: 'Your quotation',
    body_html_rendered: '<p>Hi</p>',
    body_text_rendered: 'Hi',
    message_id_header: '<abc@test.local>',
    tracking_enabled: true,
    status: 'sent',
    smtp_response: '250 OK',
    queued_at: new Date(),
    sent_at: new Date('2026-07-01T00:00:00Z'),
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
    follow_up_days: 5,
    follow_up_notified_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

describe('EngagementRollupService', () => {
  let customersRepository: jest.Mocked<CustomersRepository>;
  let emailMessagesRepository: jest.Mocked<EmailMessagesRepository>;
  let notificationsService: jest.Mocked<NotificationsService>;
  let service: EngagementRollupService;

  beforeEach(() => {
    customersRepository = {
      recomputeEngagementScores: jest.fn().mockResolvedValue(3),
    } as unknown as jest.Mocked<CustomersRepository>;

    emailMessagesRepository = {
      findDueFollowUps: jest.fn().mockResolvedValue([]),
      markFollowUpNotified: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<EmailMessagesRepository>;

    notificationsService = {
      notify: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<NotificationsService>;

    service = new EngagementRollupService(
      customersRepository,
      emailMessagesRepository,
      notificationsService,
    );
  });

  it('recomputes engagement scores on every run', async () => {
    await service.run();

    expect(customersRepository.recomputeEngagementScores).toHaveBeenCalled();
  });

  it('fires a follow_up_due notification and marks the message notified for each due message', async () => {
    const due = buildDueMessage();
    emailMessagesRepository.findDueFollowUps.mockResolvedValue([due]);

    await service.run();

    expect(notificationsService.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        type: 'follow_up_due',
        messageId: 'message-1',
      }),
    );
    expect(emailMessagesRepository.markFollowUpNotified).toHaveBeenCalledWith(
      'message-1',
    );
  });

  it('does nothing follow-up related when no messages are due', async () => {
    await service.run();

    expect(notificationsService.notify).not.toHaveBeenCalled();
    expect(emailMessagesRepository.markFollowUpNotified).not.toHaveBeenCalled();
  });

  it('notifies and marks every due message when several are found', async () => {
    emailMessagesRepository.findDueFollowUps.mockResolvedValue([
      buildDueMessage({ id: 'message-1' }),
      buildDueMessage({
        id: 'message-2',
        to_name: null,
        to_email: 'bob@acme.com',
      }),
    ]);

    await service.run();

    expect(notificationsService.notify).toHaveBeenCalledTimes(2);
    expect(emailMessagesRepository.markFollowUpNotified).toHaveBeenCalledTimes(
      2,
    );
    const secondCall = notificationsService.notify.mock.calls.find(
      ([input]) => input.messageId === 'message-2',
    );
    expect(secondCall?.[0].title).toContain('bob@acme.com');
  });
});
