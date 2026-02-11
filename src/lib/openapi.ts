import { zodToJsonSchema } from 'zod-to-json-schema';
import { CardInputSchema, WriteCardsInputSchema } from '../schemas/card.js';

export function createOpenApiSpec(serverUrl: string): object {
  const CardInputJsonSchema = zodToJsonSchema(CardInputSchema, 'CardInput');
  const WriteCardsInputJsonSchema = zodToJsonSchema(WriteCardsInputSchema, 'WriteCardsInput');

  return {
    openapi: '3.1.0',
    info: {
      title: 'Supascribe Notes MCP',
      description: 'API for writing index cards to Supabase',
      version: '1.0.0',
    },
    servers: [
      {
        url: serverUrl,
      },
    ],
    components: {
      schemas: {
        CardInput:
          (CardInputJsonSchema as { definitions?: { [key: string]: unknown } }).definitions
            ?.CardInput || CardInputJsonSchema,
        WriteCardsInput:
          (WriteCardsInputJsonSchema as { definitions?: { [key: string]: unknown } }).definitions
            ?.WriteCardsInput || WriteCardsInputJsonSchema,
      },
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    paths: {
      '/health': {
        get: {
          operationId: 'healthCheck',
          summary: 'Check server health',
          responses: {
            '200': {
              description: 'Server is healthy',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      status: { type: 'string', example: 'ok' },
                      timestamp: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/write-cards': {
        post: {
          operationId: 'writeCards',
          summary: 'Write index cards to Supabase',
          description: 'Validates and upserts index cards to the database with revision history.',
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/WriteCardsInput',
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Cards written successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      run_id: { type: 'string' },
                      written: { type: 'number' },
                      errors: { type: 'number' },
                      results: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            objectID: { type: 'string' },
                            title: { type: 'string' },
                            status: { type: 'string', enum: ['created', 'updated'] },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            '400': {
              description: 'Bad Request - Validation Error',
            },
            '401': {
              description: 'Unauthorized - Invalid or missing token',
            },
            '500': {
              description: 'Internal Server Error',
            },
          },
        },
      },
    },
  };
}
