import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import type { HealthCheckResponse } from '@tft/shared';
import { AppModule } from './../src/app.module';

describe('HealthController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/health (GET)', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(200);
    const body = response.body as HealthCheckResponse;

    expect(body).toEqual({
      status: 'ok',
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any() is inherently `any` in @types/jest
      timestamp: expect.any(String),
    });
  });

  afterEach(async () => {
    await app.close();
  });
});
