import { describe, it, expect } from 'vitest';
import { createOpenApiSpec } from './openapi.js';

describe('createOpenApiSpec', () => {
  it('should generate a valid OpenAPI spec with x-openai-isConsequential', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const spec = createOpenApiSpec('https://api.example.com') as any;

    expect(spec.openapi).toBe('3.1.0');
    expect(spec.info.title).toBe('Supascribe Notes Action');
    expect(spec.paths['/api/write-cards'].post['x-openai-isConsequential']).toBe(true);
    expect(spec.components.schemas.CardInput).toBeDefined();
    expect(spec.components.schemas.CardInput.properties.title.description).toBeDefined();
    expect(spec.components.schemas.WriteCardsInput).toBeDefined();
  });
});
