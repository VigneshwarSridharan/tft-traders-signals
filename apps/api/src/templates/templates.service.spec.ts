import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TemplatesService } from './templates.service';
import { TemplatesRepository } from '../database/templates.repository';
import { TemplateCategoriesRepository } from '../database/template-categories.repository';
import { CustomFieldDefsRepository } from '../database/custom-field-defs.repository';
import { CustomersRepository } from '../database/customers.repository';
import type {
  CustomerRow,
  EmailTemplateRow,
  TemplateCategoryRow,
  TemplateVersionRow,
} from '../database/rows';

function buildCategoryRow(
  overrides: Partial<TemplateCategoryRow> = {},
): TemplateCategoryRow {
  return {
    id: 'category-1',
    name: 'Quotation',
    default_template_id: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

function buildTemplateRow(
  overrides: Partial<EmailTemplateRow> = {},
): EmailTemplateRow {
  return {
    id: 'template-1',
    category_id: 'category-1',
    name: 'Quote template',
    status: 'draft',
    current_version_id: 'version-1',
    created_by: 'user-1',
    deleted_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

function buildVersionRow(
  overrides: Partial<TemplateVersionRow> = {},
): TemplateVersionRow {
  return {
    id: 'version-1',
    template_id: 'template-1',
    version_no: 1,
    subject: 'Hello {{customer.name}}',
    body_html: '<p>Hi {{customer.name}}, from {{sender.name}}</p>',
    body_text: 'Hi {{customer.name}}, from {{sender.name}}',
    placeholders: ['customer.name', 'sender.name'],
    created_by: 'user-1',
    created_at: new Date(),
    updated_at: new Date(),
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

describe('TemplatesService', () => {
  let service: TemplatesService;
  let templatesRepository: jest.Mocked<TemplatesRepository>;
  let templateCategoriesRepository: jest.Mocked<TemplateCategoriesRepository>;
  let customFieldDefsRepository: jest.Mocked<CustomFieldDefsRepository>;
  let customersRepository: jest.Mocked<CustomersRepository>;

  beforeEach(() => {
    templatesRepository = {
      list: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      setCurrentVersion: jest.fn(),
      softDelete: jest.fn(),
      createVersion: jest.fn(),
      findVersionById: jest.fn(),
      listVersions: jest.fn(),
      findCurrentVersionsByTemplateIds: jest.fn().mockResolvedValue(new Map()),
    } as unknown as jest.Mocked<TemplatesRepository>;

    templateCategoriesRepository = {
      list: jest.fn().mockResolvedValue([buildCategoryRow()]),
      findById: jest.fn().mockResolvedValue(buildCategoryRow()),
      findByName: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<TemplateCategoriesRepository>;

    customFieldDefsRepository = {
      list: jest.fn().mockResolvedValue([]),
      findById: jest.fn(),
      findByKey: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<CustomFieldDefsRepository>;

    customersRepository = {
      findById: jest.fn(),
      getFieldValues: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<CustomersRepository>;

    service = new TemplatesService(
      templatesRepository,
      templateCategoriesRepository,
      customFieldDefsRepository,
      customersRepository,
    );
  });

  describe('create', () => {
    it('rejects an unknown category', async () => {
      templateCategoriesRepository.findById.mockResolvedValue(null);

      await expect(
        service.create(
          {
            categoryId: 'missing',
            name: 'Quote',
            subject: 'Hi',
            bodyHtml: '<p>Hi</p>',
          },
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('sanitizes html, extracts placeholders, and creates version 1', async () => {
      const template = buildTemplateRow();
      templatesRepository.create.mockResolvedValue(template);
      templatesRepository.createVersion.mockResolvedValue(buildVersionRow());
      templatesRepository.setCurrentVersion.mockResolvedValue(template);
      templatesRepository.findById.mockResolvedValue(template);

      await service.create(
        {
          categoryId: 'category-1',
          name: 'Quote',
          subject: 'Hi {{customer.name}}',
          bodyHtml: '<p>Hi {{customer.name}}</p><script>evil()</script>',
        },
        'user-1',
      );

      expect(templatesRepository.createVersion).toHaveBeenCalledWith(
        expect.objectContaining({
          templateId: template.id,
          bodyHtml: '<p>Hi {{customer.name}}</p>',
          placeholders: ['customer.name'],
          createdBy: 'user-1',
        }),
      );
      expect(templatesRepository.setCurrentVersion).toHaveBeenCalledWith(
        template.id,
        'version-1',
      );
    });

    it('auto-generates plain text from html when none is provided', async () => {
      const template = buildTemplateRow();
      templatesRepository.create.mockResolvedValue(template);
      templatesRepository.createVersion.mockResolvedValue(buildVersionRow());
      templatesRepository.setCurrentVersion.mockResolvedValue(template);
      templatesRepository.findById.mockResolvedValue(template);

      await service.create(
        {
          categoryId: 'category-1',
          name: 'Quote',
          subject: 'Hi',
          bodyHtml: '<p>Line one</p><p>Line two</p>',
        },
        'user-1',
      );

      expect(templatesRepository.createVersion).toHaveBeenCalledWith(
        expect.objectContaining({ bodyText: 'Line one\nLine two' }),
      );
    });
  });

  describe('listVersions / mergeFields', () => {
    it('flags placeholders that are not known merge fields', async () => {
      templatesRepository.findById.mockResolvedValue(buildTemplateRow());
      templatesRepository.listVersions.mockResolvedValue([
        buildVersionRow({
          placeholders: ['customer.name', 'quotation.totally_unknown'],
        }),
      ]);

      const [version] = await service.listVersions('template-1');

      expect(version.unknownPlaceholders).toEqual([
        'quotation.totally_unknown',
      ]);
    });

    it('throws when the template does not exist', async () => {
      templatesRepository.findById.mockResolvedValue(null);
      await expect(service.listVersions('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('duplicate', () => {
    it('copies the current version content into a new draft template', async () => {
      const original = buildTemplateRow();
      const copy = buildTemplateRow({
        id: 'template-2',
        name: 'Quote template (Copy)',
      });
      templatesRepository.findById.mockImplementation((id) =>
        Promise.resolve(id === 'template-1' ? original : copy),
      );
      templatesRepository.findVersionById.mockResolvedValue(buildVersionRow());
      templatesRepository.create.mockResolvedValue(copy);
      templatesRepository.createVersion.mockResolvedValue(
        buildVersionRow({ id: 'version-2', template_id: 'template-2' }),
      );
      templatesRepository.setCurrentVersion.mockResolvedValue(copy);

      const result = await service.duplicate('template-1', 'user-1');

      expect(templatesRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          categoryId: original.category_id,
          name: 'Quote template (Copy)',
        }),
      );
      expect(result.name).toBe('Quote template (Copy)');
    });
  });

  describe('preview', () => {
    it('renders known merge fields and reports unresolved ones', async () => {
      templatesRepository.findById.mockResolvedValue(buildTemplateRow());
      templatesRepository.findVersionById.mockResolvedValue(buildVersionRow());

      const result = await service.preview('template-1', {});

      expect(result.subject).toBe('Hello Sample Customer');
      expect(result.bodyHtml).toContain('Sample Customer');
      expect(result.bodyHtml).toContain('Your Company');
      expect(result.unresolvedPlaceholders).toEqual([]);
    });

    it('uses real customer data when a customerId is given', async () => {
      templatesRepository.findById.mockResolvedValue(buildTemplateRow());
      templatesRepository.findVersionById.mockResolvedValue(buildVersionRow());
      customersRepository.findById.mockResolvedValue(buildCustomerRow());

      const result = await service.preview('template-1', {
        customerId: 'customer-1',
      });

      expect(result.subject).toBe('Hello Jane Doe');
    });

    it('leaves unknown placeholders untouched and reports them', async () => {
      templatesRepository.findById.mockResolvedValue(buildTemplateRow());
      templatesRepository.findVersionById.mockResolvedValue(
        buildVersionRow({
          subject: 'Order {{quotation.mystery}}',
          placeholders: ['quotation.mystery'],
        }),
      );

      const result = await service.preview('template-1', {});

      expect(result.subject).toBe('Order {{quotation.mystery}}');
      expect(result.unresolvedPlaceholders).toEqual(['quotation.mystery']);
    });

    it('requires subject/bodyHtml when previewing without a template id', async () => {
      await expect(service.preview(null, {})).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
