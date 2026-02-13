import { zodToJsonSchema } from 'zod-to-json-schema';
import { CardInputSchema, WriteCardsInputSchema } from '../schemas/card.js';

export function createOpenApiSpec(serverUrl: string): object {
  // Generate schemas with proper references
  const CardInputJsonSchema = zodToJsonSchema(CardInputSchema, 'CardInput');
  const WriteCardsInputJsonSchema = zodToJsonSchema(WriteCardsInputSchema, 'WriteCardsInput');

  // Helper to extract the actual schema definition from zod-to-json-schema output
  type JsonSchemaWithDefinitions = { definitions?: Record<string, unknown> };
  const getDefinition = (jsonSchema: JsonSchemaWithDefinitions | unknown, name: string) => {
    return (jsonSchema as JsonSchemaWithDefinitions).definitions?.[name] || jsonSchema;
  };

  return {
    openapi: '3.1.0',
    info: {
      title: 'Supascribe Notes Action',
      description:
        'API for writing formatted index cards to Supabase, integrating directly with ChatGPT.',
      version: '1.0.0',
    },
    servers: [
      {
        url: serverUrl,
      },
    ],
    components: {
      schemas: {
        CardInput: getDefinition(CardInputJsonSchema, 'CardInput'),
        WriteCardsInput: getDefinition(WriteCardsInputJsonSchema, 'WriteCardsInput'),
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
          'x-openai-isConsequential': true,
          summary: 'Write index cards to Supabase',
          description:
            'Validates and upserts index cards to the database with revision history. This is a consequential action.',
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
