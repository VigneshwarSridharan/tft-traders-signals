import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import * as argon2 from 'argon2';
import request from 'supertest';
import { App } from 'supertest/types';
import type {
  EmailTemplateSummary,
  MergeFieldOption,
  TemplateCategorySummary,
  TemplatePreviewResponse,
  TemplateVersionSummary,
} from '@tft/shared';
import { AppModule } from './../src/app.module';
import { UsersRepository } from './../src/database/users.repository';

describe('Templates (e2e)', () => {
  let app: INestApplication<App>;
  let usersRepository: UsersRepository;
  let adminCookies: string[];
  let agentCookies: string[];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();

    usersRepository = app.get(UsersRepository);

    async function loginAsNewUser(role: 'admin' | 'agent'): Promise<string[]> {
      const email = `${role}-${randomUUID()}@example.com`;
      const password = 'TestPass123!';
      const passwordHash = await argon2.hash(password, {
        type: argon2.argon2id,
      });
      await usersRepository.create({
        email,
        name: `Test ${role}`,
        passwordHash,
        role,
      });
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password })
        .expect(200);
      return loginResponse.get('Set-Cookie') ?? [];
    }

    adminCookies = await loginAsNewUser('admin');
    agentCookies = await loginAsNewUser('agent');
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects unauthenticated requests', async () => {
    await request(app.getHttpServer()).get('/templates').expect(401);
  });

  it('creates a template category and exposes merge fields', async () => {
    const categoryName = `Quotation ${randomUUID()}`;
    await request(app.getHttpServer())
      .post('/template-categories')
      .set('Cookie', adminCookies)
      .send({ name: categoryName })
      .expect(201);

    const categoriesResponse = await request(app.getHttpServer())
      .get('/template-categories')
      .set('Cookie', agentCookies)
      .expect(200);
    const categories = categoriesResponse.body as TemplateCategorySummary[];
    expect(categories.some((c) => c.name === categoryName)).toBe(true);

    const mergeFieldsResponse = await request(app.getHttpServer())
      .get('/templates/merge-fields')
      .set('Cookie', agentCookies)
      .expect(200);
    const mergeFields = mergeFieldsResponse.body as MergeFieldOption[];
    expect(mergeFields.some((f) => f.key === 'customer.name')).toBe(true);
    expect(mergeFields.some((f) => f.key === 'sender.signature')).toBe(true);
  });

  it('rejects a non-admin creating a template category', async () => {
    await request(app.getHttpServer())
      .post('/template-categories')
      .set('Cookie', agentCookies)
      .send({ name: `Should fail ${randomUUID()}` })
      .expect(403);
  });

  it('creates → edits (new version) → duplicates → archives a template, with version history and preview', async () => {
    const categoryResponse = await request(app.getHttpServer())
      .post('/template-categories')
      .set('Cookie', adminCookies)
      .send({ name: `Quotation ${randomUUID()}` })
      .expect(201);
    const quotationCategory = categoryResponse.body as TemplateCategorySummary;

    const createResponse = await request(app.getHttpServer())
      .post('/templates')
      .set('Cookie', adminCookies)
      .send({
        categoryId: quotationCategory.id,
        name: `Quotation ${randomUUID()}`,
        subject: 'Your quote {{quotation.number}}, {{customer.name}}',
        bodyHtml:
          '<p>Hi {{customer.name}}, please find your quote attached.</p><script>alert(1)</script>',
      })
      .expect(201);

    const created = createResponse.body as EmailTemplateSummary;
    expect(created.status).toBe('draft');
    expect(created.currentVersion?.versionNo).toBe(1);
    expect(created.currentVersion?.bodyHtml).not.toContain('<script>');
    expect(created.currentVersion?.placeholders).toEqual(
      expect.arrayContaining(['quotation.number', 'customer.name']),
    );
    expect(created.currentVersion?.unknownPlaceholders).toEqual([]);
    expect(created.currentVersion?.bodyText).toContain(
      'please find your quote attached',
    );

    // Unknown placeholder produces a warning, not a save failure.
    const versionWithWarningResponse = await request(app.getHttpServer())
      .post(`/templates/${created.id}/versions`)
      .set('Cookie', adminCookies)
      .send({
        subject: 'Your quote {{customer.name}}',
        bodyHtml: '<p>Hi {{customer.name}}, see {{totally.unknown}}.</p>',
      })
      .expect(201);
    const editedTemplate =
      versionWithWarningResponse.body as EmailTemplateSummary;
    expect(editedTemplate.currentVersion?.versionNo).toBe(2);
    expect(editedTemplate.currentVersion?.unknownPlaceholders).toEqual([
      'totally.unknown',
    ]);

    // Version history keeps both immutable snapshots.
    const versionsResponse = await request(app.getHttpServer())
      .get(`/templates/${created.id}/versions`)
      .set('Cookie', adminCookies)
      .expect(200);
    const versions = versionsResponse.body as TemplateVersionSummary[];
    expect(versions.map((v) => v.versionNo).sort()).toEqual([1, 2]);

    // Preview with sample data.
    const previewResponse = await request(app.getHttpServer())
      .post(`/templates/${created.id}/preview`)
      .set('Cookie', adminCookies)
      .send({})
      .expect(201);
    const preview = previewResponse.body as TemplatePreviewResponse;
    expect(preview.subject).toContain('Sample Customer');
    expect(preview.unresolvedPlaceholders).toEqual(['totally.unknown']);

    // Duplicate.
    const duplicateResponse = await request(app.getHttpServer())
      .post(`/templates/${created.id}/duplicate`)
      .set('Cookie', adminCookies)
      .expect(201);
    const duplicate = duplicateResponse.body as EmailTemplateSummary;
    expect(duplicate.id).not.toBe(created.id);
    expect(duplicate.name).toBe(`${created.name} (Copy)`);
    expect(duplicate.currentVersion?.subject).toBe(
      editedTemplate.currentVersion?.subject,
    );

    // Activate then archive.
    await request(app.getHttpServer())
      .patch(`/templates/${created.id}`)
      .set('Cookie', adminCookies)
      .send({ status: 'active' })
      .expect(200)
      .expect((res) => {
        expect((res.body as EmailTemplateSummary).status).toBe('active');
      });

    const archivedResponse = await request(app.getHttpServer())
      .patch(`/templates/${created.id}`)
      .set('Cookie', adminCookies)
      .send({ status: 'archived' })
      .expect(200);
    expect((archivedResponse.body as EmailTemplateSummary).status).toBe(
      'archived',
    );

    // Test-send stub does not error and is clearly marked as a stub.
    await request(app.getHttpServer())
      .post(`/templates/${created.id}/test-send`)
      .set('Cookie', adminCookies)
      .send({ to: 'me@example.com' })
      .expect(201)
      .expect((res) => {
        expect(res.body).toEqual({
          accepted: true,
          to: 'me@example.com',
          stub: true,
        });
      });

    // Soft-delete then 404 on fetch.
    await request(app.getHttpServer())
      .delete(`/templates/${duplicate.id}`)
      .set('Cookie', adminCookies)
      .expect(204);
    await request(app.getHttpServer())
      .get(`/templates/${duplicate.id}`)
      .set('Cookie', adminCookies)
      .expect(404);
  });

  it('sets a default template for a category', async () => {
    const followUpCategoryResponse = await request(app.getHttpServer())
      .post('/template-categories')
      .set('Cookie', adminCookies)
      .send({ name: `Follow-up ${randomUUID()}` })
      .expect(201);
    const followUpCategory =
      followUpCategoryResponse.body as TemplateCategorySummary;

    const otherCategoryResponse = await request(app.getHttpServer())
      .post('/template-categories')
      .set('Cookie', adminCookies)
      .send({ name: `Invoice ${randomUUID()}` })
      .expect(201);
    const otherCategory = otherCategoryResponse.body as TemplateCategorySummary;

    const templateResponse = await request(app.getHttpServer())
      .post('/templates')
      .set('Cookie', adminCookies)
      .send({
        categoryId: followUpCategory.id,
        name: `Follow-up ${randomUUID()}`,
        subject: 'Checking in',
        bodyHtml: '<p>Just checking in, {{customer.name}}.</p>',
      })
      .expect(201);
    const template = templateResponse.body as EmailTemplateSummary;

    const updateCategoryResponse = await request(app.getHttpServer())
      .patch(`/template-categories/${followUpCategory.id}`)
      .set('Cookie', adminCookies)
      .send({ defaultTemplateId: template.id })
      .expect(200);
    expect(
      (updateCategoryResponse.body as TemplateCategorySummary)
        .defaultTemplateId,
    ).toBe(template.id);

    // A default template from another category is rejected.
    await request(app.getHttpServer())
      .patch(`/template-categories/${otherCategory.id}`)
      .set('Cookie', adminCookies)
      .send({ defaultTemplateId: template.id })
      .expect(400);
  });
});
