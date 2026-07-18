import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { CustomersService } from './customers.service';
import { AuditLogsRepository } from '../database/audit-logs.repository';
import { CustomersRepository } from '../database/customers.repository';
import { CustomFieldDefsRepository } from '../database/custom-field-defs.repository';
import { TagsRepository } from '../database/tags.repository';
import { EmailMessagesRepository } from '../database/email-messages.repository';
import { TrackingEventsRepository } from '../database/tracking-events.repository';
import type {
  CustomerRow,
  CustomFieldDefRow,
  EmailMessageRow,
  TrackingEventRow,
} from '../database/rows';

function buildMessageRow(
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
    queued_at: new Date('2026-07-01T00:00:00Z'),
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
    follow_up_days: null,
    follow_up_notified_at: null,
    created_at: new Date('2026-07-01T00:00:00Z'),
    updated_at: new Date('2026-07-01T00:00:00Z'),
    ...overrides,
  };
}

function buildTrackingEventRow(
  overrides: Partial<TrackingEventRow> = {},
): TrackingEventRow {
  return {
    id: 'event-1',
    message_id: 'message-1',
    link_id: null,
    event_type: 'open',
    occurred_at: new Date('2026-07-02T00:00:00Z'),
    ip: null,
    user_agent: null,
    device_type: null,
    os: null,
    browser: null,
    geo_country: null,
    geo_city: null,
    is_bot: false,
    is_proxy: false,
    metadata: {},
    ...overrides,
  };
}

function buildCustomerRow(overrides: Partial<CustomerRow> = {}): CustomerRow {
  return {
    id: 'customer-1',
    name: 'Jane Doe',
    company: 'Acme Corp',
    email: 'jane@acme.com',
    phone: null,
    notes: null,
    tracking_opt_out: false,
    engagement_score: 0,
    deleted_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

function buildFieldDefRow(
  overrides: Partial<CustomFieldDefRow> = {},
): CustomFieldDefRow {
  return {
    id: 'field-1',
    key: 'gst_number',
    label: 'GST Number',
    field_type: 'text',
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

describe('CustomersService', () => {
  let service: CustomersService;
  let customersRepository: jest.Mocked<CustomersRepository>;
  let customFieldDefsRepository: jest.Mocked<CustomFieldDefsRepository>;
  let tagsRepository: jest.Mocked<TagsRepository>;
  let emailMessagesRepository: jest.Mocked<EmailMessagesRepository>;
  let trackingEventsRepository: jest.Mocked<TrackingEventsRepository>;

  beforeEach(() => {
    customersRepository = {
      list: jest.fn(),
      listAll: jest.fn(),
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findByEmails: jest.fn().mockResolvedValue(new Map()),
      create: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      getFieldValues: jest.fn(),
      getFieldValuesForCustomers: jest.fn().mockResolvedValue(new Map()),
      setFieldValue: jest.fn(),
      getSuppressionFlags: jest.fn().mockResolvedValue(new Map()),
    } as unknown as jest.Mocked<CustomersRepository>;

    customFieldDefsRepository = {
      list: jest.fn().mockResolvedValue([]),
      findById: jest.fn(),
      findByKey: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<CustomFieldDefsRepository>;

    tagsRepository = {
      list: jest.fn(),
      findById: jest.fn(),
      findByName: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      listForEntity: jest.fn(),
      listForEntities: jest.fn().mockResolvedValue(new Map()),
      addTagging: jest.fn(),
      removeTagging: jest.fn(),
    } as unknown as jest.Mocked<TagsRepository>;

    emailMessagesRepository = {
      listForCustomer: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<EmailMessagesRepository>;

    trackingEventsRepository = {
      listForCustomer: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<TrackingEventsRepository>;

    const auditLogsRepository = {
      record: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AuditLogsRepository>;

    service = new CustomersService(
      customersRepository,
      customFieldDefsRepository,
      tagsRepository,
      emailMessagesRepository,
      trackingEventsRepository,
      auditLogsRepository,
    );
  });

  describe('create', () => {
    it('rejects a duplicate email', async () => {
      customersRepository.findByEmail.mockResolvedValue(buildCustomerRow());

      await expect(
        service.create({ name: 'Jane', email: 'jane@acme.com' }),
      ).rejects.toThrow(ConflictException);
      expect(customersRepository.create).not.toHaveBeenCalled();
    });

    it('rejects an unknown custom field key', async () => {
      customersRepository.findByEmail.mockResolvedValue(null);
      customersRepository.create.mockResolvedValue(buildCustomerRow());
      customFieldDefsRepository.list.mockResolvedValue([]);

      await expect(
        service.create({
          name: 'Jane',
          email: 'jane@acme.com',
          customFields: { unknown_field: 'value' },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an invalid value for a typed custom field', async () => {
      customersRepository.findByEmail.mockResolvedValue(null);
      customersRepository.create.mockResolvedValue(buildCustomerRow());
      customFieldDefsRepository.list.mockResolvedValue([
        buildFieldDefRow({ field_type: 'number' }),
      ]);

      await expect(
        service.create({
          name: 'Jane',
          email: 'jane@acme.com',
          customFields: { gst_number: 'not-a-number' },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates a customer with valid custom field values and tags', async () => {
      const created = buildCustomerRow();
      customersRepository.findByEmail.mockResolvedValue(null);
      customersRepository.create.mockResolvedValue(created);
      customFieldDefsRepository.list.mockResolvedValue([buildFieldDefRow()]);
      tagsRepository.findById.mockResolvedValue({
        id: 'tag-1',
        name: 'VIP',
        color: null,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const result = await service.create({
        name: 'Jane',
        email: 'jane@acme.com',
        customFields: { gst_number: '29ABCDE1234F1Z5' },
        tagIds: ['tag-1'],
      });

      expect(customersRepository.setFieldValue).toHaveBeenCalledWith(
        created.id,
        'field-1',
        '29ABCDE1234F1Z5',
      );
      expect(tagsRepository.addTagging).toHaveBeenCalledWith(
        'tag-1',
        'customer',
        created.id,
      );
      expect(result.email).toBe('jane@acme.com');
    });

    it('throws when assigning a tag that does not exist', async () => {
      customersRepository.findByEmail.mockResolvedValue(null);
      customersRepository.create.mockResolvedValue(buildCustomerRow());
      tagsRepository.findById.mockResolvedValue(null);

      await expect(
        service.create({
          name: 'Jane',
          email: 'jane@acme.com',
          tagIds: ['missing-tag'],
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('throws when the customer does not exist', async () => {
      customersRepository.findById.mockResolvedValue(null);
      await expect(
        service.update('missing', { name: 'New Name' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('applies custom field updates separately from column updates', async () => {
      const existing = buildCustomerRow();
      customersRepository.findById.mockResolvedValue(existing);
      customersRepository.update.mockResolvedValue(existing);
      customFieldDefsRepository.list.mockResolvedValue([buildFieldDefRow()]);

      await service.update('customer-1', {
        name: 'Updated Name',
        customFields: { gst_number: 'new-value' },
      });

      expect(customersRepository.update).toHaveBeenCalledWith('customer-1', {
        name: 'Updated Name',
      });
      expect(customersRepository.setFieldValue).toHaveBeenCalledWith(
        'customer-1',
        'field-1',
        'new-value',
      );
    });
  });

  describe('getTimeline', () => {
    it('throws when the customer does not exist', async () => {
      customersRepository.findById.mockResolvedValue(null);
      await expect(service.getTimeline('missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('merges sends and tracking events into one chronological (newest first) timeline', async () => {
      customersRepository.findById.mockResolvedValue(buildCustomerRow());
      emailMessagesRepository.listForCustomer.mockResolvedValue([
        buildMessageRow({
          id: 'message-1',
          subject: 'Your quotation',
          sent_at: new Date('2026-07-01T00:00:00Z'),
        }),
      ]);
      trackingEventsRepository.listForCustomer.mockResolvedValue([
        buildTrackingEventRow({
          id: 'event-open',
          message_id: 'message-1',
          event_type: 'open',
          occurred_at: new Date('2026-07-02T00:00:00Z'),
        }),
        buildTrackingEventRow({
          id: 'event-reply',
          message_id: 'message-1',
          event_type: 'reply',
          occurred_at: new Date('2026-07-03T00:00:00Z'),
        }),
      ]);

      const timeline = await service.getTimeline('customer-1');

      expect(timeline.items.map((item) => item.type)).toEqual([
        'reply',
        'open',
        'sent',
      ]);
      expect(timeline.items[0].subject).toBe('Your quotation');
      expect(timeline.items[2].messageId).toBe('message-1');
    });
  });

  describe('delete', () => {
    it('throws when the customer does not exist', async () => {
      customersRepository.findById.mockResolvedValue(null);
      await expect(service.delete('missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('soft-deletes an existing customer', async () => {
      customersRepository.findById.mockResolvedValue(buildCustomerRow());
      await service.delete('customer-1');
      expect(customersRepository.softDelete).toHaveBeenCalledWith('customer-1');
    });
  });

  describe('importCsv', () => {
    it('rejects a CSV missing required columns', async () => {
      await expect(service.importCsv('foo,bar\n1,2')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('imports valid rows and reports errors for bad ones', async () => {
      customersRepository.findByEmails.mockResolvedValue(
        new Map([
          [
            'existing@example.com',
            buildCustomerRow({ email: 'existing@example.com' }),
          ],
        ]),
      );
      customersRepository.create.mockResolvedValue(buildCustomerRow());

      const csv = [
        'name,email,company',
        'Valid Row,valid@example.com,Valid Co',
        ',missing-name@example.com,No Name Co',
        'Invalid Email,not-an-email,Bad Co',
        'Duplicate In File,valid@example.com,Dup Co',
        'Already Exists,existing@example.com,Existing Co',
      ].join('\n');

      const result = await service.importCsv(csv);

      expect(result.imported).toBe(1);
      expect(result.skipped).toBe(4);
      expect(customersRepository.create).toHaveBeenCalledTimes(1);
      expect(result.errors.map((e) => e.reason)).toEqual([
        'Missing name',
        'Invalid email',
        'Duplicate email in file',
        'Customer with this email already exists',
      ]);
    });
  });
});
