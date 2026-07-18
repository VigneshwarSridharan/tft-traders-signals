/**
 * Hand-authored OpenAPI 3.0 document for the public REST API (`/v1/*`).
 * Deliberately not generated via @nestjs/swagger (not a project dependency)
 * — shapes are described informally rather than with perfect JSON-schema
 * fidelity, but every route below is accurate.
 */
export const OPENAPI_SPEC = {
  openapi: '3.0.3',
  info: {
    title: 'TFT Traders Signals — Public API',
    version: '1.0.0',
    description:
      'API-key-authenticated REST API for sending emails, managing templates/customers, and reading message status and analytics. Outbound webhooks (see docs) push real-time delivery/engagement events instead of requiring polling.',
  },
  servers: [
    {
      url: 'https://{apiHost}',
      description:
        'The API host configured in your deployment (Caddy API_HOST — api.localhost in local dev, e.g. api.yourdomain.com in production).',
      variables: { apiHost: { default: 'api.localhost' } },
    },
  ],
  security: [{ ApiKeyAuth: [] }],
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'sk_live_...',
        description:
          'Create a key from the dashboard (Settings → API Keys) and send it as `Authorization: Bearer <key>`.',
      },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          statusCode: { type: 'integer' },
          message: {
            oneOf: [
              { type: 'string' },
              { type: 'array', items: { type: 'string' } },
            ],
          },
        },
      },
    },
  },
  paths: {
    '/v1/send': {
      post: {
        summary:
          'Compose and send (or schedule) an email to one or more customers',
        description:
          'Attachments are not supported via the public API yet — use the dashboard compose UI for attachments.',
        security: [{ ApiKeyAuth: ['send'] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['senderAccountId', 'customerIds'],
                properties: {
                  senderAccountId: { type: 'string', format: 'uuid' },
                  customerIds: {
                    type: 'array',
                    items: { type: 'string', format: 'uuid' },
                    minItems: 1,
                  },
                  templateVersionId: { type: 'string', format: 'uuid' },
                  subject: { type: 'string' },
                  bodyHtml: { type: 'string' },
                  bodyText: { type: 'string', nullable: true },
                  fallbackValues: {
                    type: 'object',
                    additionalProperties: { type: 'string' },
                  },
                  trackingEnabled: { type: 'boolean' },
                  scheduledFor: { type: 'string', format: 'date-time' },
                  timezone: { type: 'string' },
                  parentMessageId: { type: 'string', format: 'uuid' },
                  followUpDays: { type: 'integer' },
                },
                description:
                  'Either templateVersionId, or both subject and bodyHtml, must be provided.',
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Per-recipient send results',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    results: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          customerId: { type: 'string', format: 'uuid' },
                          ok: { type: 'boolean' },
                          messageId: {
                            type: 'string',
                            format: 'uuid',
                            nullable: true,
                          },
                          error: { type: 'string', nullable: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          '403': { description: 'Missing the `send` scope or role' },
        },
      },
    },
    '/v1/messages': {
      get: {
        summary: 'List sent messages',
        security: [{ ApiKeyAuth: ['read:messages'] }],
        parameters: [
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string' } },
          {
            name: 'senderAccountId',
            in: 'query',
            schema: { type: 'string', format: 'uuid' },
          },
          {
            name: 'templateId',
            in: 'query',
            schema: { type: 'string', format: 'uuid' },
          },
          {
            name: 'dateFrom',
            in: 'query',
            schema: { type: 'string', format: 'date-time' },
          },
          {
            name: 'dateTo',
            in: 'query',
            schema: { type: 'string', format: 'date-time' },
          },
          {
            name: 'page',
            in: 'query',
            schema: { type: 'integer', default: 1 },
          },
          {
            name: 'pageSize',
            in: 'query',
            schema: { type: 'integer', default: 25 },
          },
        ],
        responses: {
          '200': { description: 'Paginated list of sent messages' },
        },
      },
    },
    '/v1/messages/{id}': {
      get: {
        summary: 'Get a single message (status, open/click counts, etc.)',
        security: [{ ApiKeyAuth: ['read:messages'] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': { description: 'Message detail' },
          '404': {
            description:
              'Not found (or not owned by this key’s user, for agents)',
          },
        },
      },
    },
    '/v1/templates': {
      get: {
        summary: 'List email templates',
        security: [{ ApiKeyAuth: ['read:templates'] }],
        responses: { '200': { description: 'Array of templates' } },
      },
      post: {
        summary: 'Create a template',
        security: [{ ApiKeyAuth: ['write:templates'] }],
        responses: { '201': { description: 'The created template' } },
      },
    },
    '/v1/templates/{id}': {
      get: {
        summary: 'Get a template',
        security: [{ ApiKeyAuth: ['read:templates'] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: { '200': { description: 'The template' } },
      },
      patch: {
        summary: 'Update a template',
        security: [{ ApiKeyAuth: ['write:templates'] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: { '200': { description: 'The updated template' } },
      },
      delete: {
        summary: 'Delete (archive) a template',
        security: [{ ApiKeyAuth: ['write:templates'] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: { '204': { description: 'Deleted' } },
      },
    },
    '/v1/customers': {
      get: {
        summary: 'List customers',
        security: [{ ApiKeyAuth: ['read:customers'] }],
        responses: { '200': { description: 'Paginated list of customers' } },
      },
      post: {
        summary: 'Create a customer',
        security: [{ ApiKeyAuth: ['write:customers'] }],
        responses: { '201': { description: 'The created customer' } },
      },
    },
    '/v1/customers/{id}': {
      get: {
        summary: 'Get a customer',
        security: [{ ApiKeyAuth: ['read:customers'] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: { '200': { description: 'The customer' } },
      },
      patch: {
        summary: 'Update a customer',
        security: [{ ApiKeyAuth: ['write:customers'] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: { '200': { description: 'The updated customer' } },
      },
      delete: {
        summary: 'Delete a customer',
        security: [{ ApiKeyAuth: ['write:customers'] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: { '204': { description: 'Deleted' } },
      },
    },
    '/v1/analytics/kpis': {
      get: {
        summary:
          'Org-wide KPI tiles (sent/delivered/opens/clicks/bounces/etc.)',
        security: [{ ApiKeyAuth: ['read:analytics'] }],
        responses: { '200': { description: 'KPI summary' } },
      },
    },
    '/v1/analytics/timeseries': {
      get: {
        summary: 'Time series of send/open/click/bounce counts',
        security: [{ ApiKeyAuth: ['read:analytics'] }],
        parameters: [
          {
            name: 'grain',
            in: 'query',
            schema: {
              type: 'string',
              enum: ['day', 'week', 'month'],
              default: 'day',
            },
          },
        ],
        responses: { '200': { description: 'Time series buckets' } },
      },
    },
  },
} as const;
