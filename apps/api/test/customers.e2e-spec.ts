import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import * as argon2 from 'argon2';
import request from 'supertest';
import { App } from 'supertest/types';
import type {
  CsvImportResult,
  CustomerListResponse,
  CustomerSummary,
  CustomFieldDefSummary,
  TagSummary,
} from '@tft/shared';
import { AppModule } from './../src/app.module';
import { UsersRepository } from './../src/database/users.repository';

describe('Customers (e2e)', () => {
  let app: INestApplication<App>;
  let usersRepository: UsersRepository;
  let adminCookies: string[];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();

    usersRepository = app.get(UsersRepository);

    const email = `admin-${randomUUID()}@example.com`;
    const password = 'AdminPass123!';
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
    });
    await usersRepository.create({
      email,
      name: 'Test Admin',
      passwordHash,
      role: 'admin',
    });

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    adminCookies = loginResponse.get('Set-Cookie') ?? [];
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects unauthenticated requests', async () => {
    await request(app.getHttpServer()).get('/customers').expect(401);
  });

  it('creates a custom field definition', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/custom-field-defs')
      .set('Cookie', adminCookies)
      .send({ key: 'gst_number', label: 'GST Number', fieldType: 'text' })
      .expect(201);

    const def = createResponse.body as CustomFieldDefSummary;
    expect(def.key).toBe('gst_number');

    const listResponse = await request(app.getHttpServer())
      .get('/custom-field-defs')
      .set('Cookie', adminCookies)
      .expect(200);
    const defs = listResponse.body as CustomFieldDefSummary[];
    expect(defs.some((d) => d.key === 'gst_number')).toBe(true);
  });

  it('rejects an invalid value for a typed custom field', async () => {
    await request(app.getHttpServer())
      .post('/custom-field-defs')
      .set('Cookie', adminCookies)
      .send({
        key: 'contract_value',
        label: 'Contract Value',
        fieldType: 'number',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/customers')
      .set('Cookie', adminCookies)
      .send({
        name: 'Bad Field Co',
        email: `badfield-${randomUUID()}@example.com`,
        customFields: { contract_value: 'not-a-number' },
      })
      .expect(400);
  });

  it('creates, tags, lists (search/sort/pagination), updates, and deletes a customer', async () => {
    const email = `acme-${randomUUID()}@example.com`;

    const tagResponse = await request(app.getHttpServer())
      .post('/tags')
      .set('Cookie', adminCookies)
      .send({ name: `VIP-${randomUUID()}`, color: '#ff0000' })
      .expect(201);
    const tag = tagResponse.body as TagSummary;

    const createResponse = await request(app.getHttpServer())
      .post('/customers')
      .set('Cookie', adminCookies)
      .send({
        name: 'Acme Corp Contact',
        email,
        company: 'Acme Corp',
        customFields: { gst_number: '29ABCDE1234F1Z5' },
        tagIds: [tag.id],
      })
      .expect(201);

    const created = createResponse.body as CustomerSummary;
    expect(created.email).toBe(email);
    expect(created.customFields.gst_number).toBe('29ABCDE1234F1Z5');
    expect(created.tags.some((t) => t.id === tag.id)).toBe(true);
    expect(created.suppressed).toBe(false);
    expect(created.unsubscribed).toBe(false);

    // Duplicate email rejected.
    await request(app.getHttpServer())
      .post('/customers')
      .set('Cookie', adminCookies)
      .send({ name: 'Duplicate', email })
      .expect(409);

    // Search finds it by company name.
    const searchResponse = await request(app.getHttpServer())
      .get('/customers')
      .query({ search: 'Acme Corp', sort: 'name', sortDir: 'asc' })
      .set('Cookie', adminCookies)
      .expect(200);
    const searchResult = searchResponse.body as CustomerListResponse;
    expect(searchResult.items.some((c) => c.id === created.id)).toBe(true);

    // Filter by tag.
    const tagFilterResponse = await request(app.getHttpServer())
      .get('/customers')
      .query({ tagId: tag.id })
      .set('Cookie', adminCookies)
      .expect(200);
    const tagFilterResult = tagFilterResponse.body as CustomerListResponse;
    expect(tagFilterResult.items.map((c) => c.id)).toContain(created.id);

    // Pagination works.
    const pagedResponse = await request(app.getHttpServer())
      .get('/customers')
      .query({ page: 1, pageSize: 1 })
      .set('Cookie', adminCookies)
      .expect(200);
    const pagedResult = pagedResponse.body as CustomerListResponse;
    expect(pagedResult.items.length).toBe(1);
    expect(pagedResult.pageSize).toBe(1);

    // Update.
    const updateResponse = await request(app.getHttpServer())
      .patch(`/customers/${created.id}`)
      .set('Cookie', adminCookies)
      .send({ notes: 'Called on Tuesday', trackingOptOut: true })
      .expect(200);
    const updated = updateResponse.body as CustomerSummary;
    expect(updated.notes).toBe('Called on Tuesday');
    expect(updated.trackingOptOut).toBe(true);

    // Remove tag.
    await request(app.getHttpServer())
      .delete(`/customers/${created.id}/tags/${tag.id}`)
      .set('Cookie', adminCookies)
      .expect(200)
      .expect((res) => {
        const body = res.body as CustomerSummary;
        expect(body.tags.some((t) => t.id === tag.id)).toBe(false);
      });

    // Delete (soft) then 404 on fetch.
    await request(app.getHttpServer())
      .delete(`/customers/${created.id}`)
      .set('Cookie', adminCookies)
      .expect(204);

    await request(app.getHttpServer())
      .get(`/customers/${created.id}`)
      .set('Cookie', adminCookies)
      .expect(404);
  });

  it('imports a CSV with valid and invalid rows, reporting errors, and exports customers', async () => {
    const validEmail = `csv-valid-${randomUUID()}@example.com`;
    const existingEmail = `csv-existing-${randomUUID()}@example.com`;

    await request(app.getHttpServer())
      .post('/customers')
      .set('Cookie', adminCookies)
      .send({ name: 'Existing Customer', email: existingEmail })
      .expect(201);

    const csv = [
      'name,email,company',
      `Valid Row,${validEmail},Valid Co`,
      ',missing-name@example.com,No Name Co',
      'Invalid Email,not-an-email,Bad Co',
      `Duplicate In File,${validEmail},Dup Co`,
      `Already Exists,${existingEmail},Existing Co`,
    ].join('\n');

    const importResponse = await request(app.getHttpServer())
      .post('/customers/import')
      .set('Cookie', adminCookies)
      .send({ csv })
      .expect(201);

    const result = importResponse.body as CsvImportResult;
    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(4);
    expect(result.errors).toHaveLength(4);
    expect(result.errors.map((e) => e.reason)).toEqual(
      expect.arrayContaining([
        'Missing name',
        'Invalid email',
        'Duplicate email in file',
        'Customer with this email already exists',
      ]),
    );

    const listResponse = await request(app.getHttpServer())
      .get('/customers')
      .query({ search: validEmail })
      .set('Cookie', adminCookies)
      .expect(200);
    const listResult = listResponse.body as CustomerListResponse;
    expect(listResult.items.some((c) => c.email === validEmail)).toBe(true);

    const exportResponse = await request(app.getHttpServer())
      .get('/customers/export')
      .set('Cookie', adminCookies)
      .expect(200);
    expect(exportResponse.headers['content-type']).toContain('text/csv');
    expect(exportResponse.text).toContain(validEmail);
    expect(exportResponse.text).toContain('gst_number');
  });
});
