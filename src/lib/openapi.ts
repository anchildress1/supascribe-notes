import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  CardInputSchema,
  WriteCardsInputSchema,
  CardIdInputSchema,
  SearchCardsInputSchema,
} from '../schemas/card.js';

export function createOpenApiSpec(serverUrl: string, serverVersion = '1.0.0'): object {
  // Generate schemas with proper references
  const CardInputJsonSchema = zodToJsonSchema(CardInputSchema, 'CardInput');
  const WriteCardsInputJsonSchema = zodToJsonSchema(WriteCardsInputSchema, 'WriteCardsInput');
  const CardIdInputJsonSchema = zodToJsonSchema(CardIdInputSchema, 'CardIdInput');
  const SearchCardsInputJsonSchema = zodToJsonSchema(SearchCardsInputSchema, 'SearchCardsInput');

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
      version: serverVersion,
    },
    servers: [
      {
        url: serverUrl,
      },
    ],
    components: {
      schemas: {
        CardInput: getDefinition(CardInputJsonSchema, 'CardInput'),
        Card: {
          allOf: [
            { $ref: '#/components/schemas/CardInput' },
            {
              type: 'object',
              properties: {
                objectID: { type: 'string', format: 'uuid' },
                created_at: { type: 'string', format: 'date-time' },
                updated_at: { type: 'string', format: 'date-time' },
              },
              required: ['objectID', 'created_at', 'updated_at'],
            },
          ],
        },
        WriteCardsInput: getDefinition(WriteCardsInputJsonSchema, 'WriteCardsInput'),
        CardIdInput: getDefinition(CardIdInputJsonSchema, 'CardIdInput'),
        SearchCardsInput: getDefinition(SearchCardsInputJsonSchema, 'SearchCardsInput'),
        LookupCategoriesResponse: {
          type: 'object',
          properties: {
            categories: { type: 'array', items: { type: 'string' } },
          },
          required: ['categories'],
        },
        LookupProjectsResponse: {
          type: 'object',
          properties: {
            projects: { type: 'array', items: { type: 'string' } },
          },
          required: ['projects'],
        },
        LookupTagsResponse: {
          type: 'object',
          properties: {
            tags: {
              type: 'object',
              properties: {
                lvl0: { type: 'array', items: { type: 'string' } },
                lvl1: { type: 'array', items: { type: 'string' } },
              },
              required: ['lvl0', 'lvl1'],
            },
          },
          required: ['tags'],
        },
        LookupCardByIdResponse: {
          type: 'object',
          properties: {
            cards: { type: 'array', items: { $ref: '#/components/schemas/Card' } },
          },
          required: ['cards'],
        },
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
      '/api/lookup-card-by-id': {
        post: {
          operationId: 'lookupCardById',
          'x-openai-isConsequential': false,
          summary: 'Lookup cards by ID',
          description:
            'Find specific cards using a list of UUIDs. Unknown IDs are omitted from the response, so the returned `cards` array may be empty.',
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/CardIdInput',
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Card lookup result',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/LookupCardByIdResponse',
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
      '/api/lookup-categories': {
        get: {
          operationId: 'lookupCategories',
          'x-openai-isConsequential': false,
          summary: 'Lookup unique categories',
          description: 'Get all unique card categories.',
          security: [{ BearerAuth: [] }],
          responses: {
            '200': {
              description: 'Unique categories list',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/LookupCategoriesResponse',
                  },
                },
              },
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
      '/api/lookup-projects': {
        get: {
          operationId: 'lookupProjects',
          'x-openai-isConsequential': false,
          summary: 'Lookup unique projects',
          description: 'Get all unique card project identifiers.',
          security: [{ BearerAuth: [] }],
          responses: {
            '200': {
              description: 'Unique projects list',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/LookupProjectsResponse',
                  },
                },
              },
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
      '/api/lookup-tags': {
        get: {
          operationId: 'lookupTags',
          'x-openai-isConsequential': false,
          summary: 'Lookup unique tags',
          description: 'Get all unique lvl0 and lvl1 tags.',
          security: [{ BearerAuth: [] }],
          responses: {
            '200': {
              description: 'Unique tags',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/LookupTagsResponse',
                  },
                },
              },
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
      '/api/search-cards': {
        post: {
          operationId: 'searchCards',
          'x-openai-isConsequential': false,
          summary: 'Search cards',
          description: 'Search cards by title, category, project, and tags.',
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/SearchCardsInput',
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Search results',
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: {
                      $ref: '#/components/schemas/Card',
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
