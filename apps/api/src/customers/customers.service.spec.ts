import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { CustomersService } from './customers.service';
import { CustomersRepository } from '../database/customers.repository';
import { CustomFieldDefsRepository } from '../database/custom-field-defs.repository';
import { TagsRepository } from '../database/tags.repository';
import type { CustomerRow, CustomFieldDefRow } from '../database/rows';

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

    service = new CustomersService(
      customersRepository,
      customFieldDefsRepository,
      tagsRepository,
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
