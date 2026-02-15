import { describe, it, expect } from 'vitest';
import { createOpenApiSpec } from './../../../src/lib/openapi.js';

describe('createOpenApiSpec', () => {
  it('should generate a valid OpenAPI spec with public tool operations', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const spec = createOpenApiSpec('https://api.example.com', '2.4.6') as any;

    expect(spec.openapi).toBe('3.1.0');
    expect(spec.info.title).toBe('Supascribe Notes Action');
    expect(spec.info.version).toBe('2.4.6');
    expect(spec.paths['/api/write-cards'].post['x-openai-isConsequential']).toBe(true);
    expect(spec.paths['/api/lookup-card-by-id'].post.operationId).toBe('lookupCardById');
    expect(spec.paths['/api/lookup-categories'].get.operationId).toBe('lookupCategories');
    expect(spec.paths['/api/lookup-projects'].get.operationId).toBe('lookupProjects');
    expect(spec.paths['/api/lookup-tags'].get.operationId).toBe('lookupTags');
    expect(spec.paths['/api/search-cards'].post.operationId).toBe('searchCards');
    expect(
      spec.paths['/api/lookup-card-by-id'].post.responses['200'].content['application/json'].schema
        .$ref,
    ).toBe('#/components/schemas/LookupCardByIdResponse');
    expect(
      spec.paths['/api/lookup-categories'].get.responses['200'].content['application/json'].schema
        .$ref,
    ).toBe('#/components/schemas/LookupCategoriesResponse');
    expect(
      spec.paths['/api/lookup-projects'].get.responses['200'].content['application/json'].schema
        .$ref,
    ).toBe('#/components/schemas/LookupProjectsResponse');
    expect(
      spec.paths['/api/lookup-tags'].get.responses['200'].content['application/json'].schema.$ref,
    ).toBe('#/components/schemas/LookupTagsResponse');
    expect(
      spec.paths['/api/search-cards'].post.responses['200'].content['application/json'].schema.type,
    ).toBe('array');
    expect(spec.components.schemas.CardInput).toBeDefined();
    expect(spec.components.schemas.Card).toBeDefined();
    expect(spec.components.schemas.CardInput.properties.title.description).toBeDefined();
    expect(spec.components.schemas.WriteCardsInput).toBeDefined();
    expect(spec.components.schemas.CardIdInput).toBeDefined();
    expect(spec.components.schemas.SearchCardsInput).toBeDefined();

    const cardInputRequired = spec.components.schemas.CardInput.required ?? [];
    expect(cardInputRequired).toEqual(
      expect.arrayContaining(['title', 'blurb', 'fact', 'tags', 'category', 'signal']),
    );
    expect(cardInputRequired).not.toEqual(expect.arrayContaining(['objectID', 'url']));

    const writeCardsItemRequired =
      spec.components.schemas.WriteCardsInput.properties.cards.items.required ?? [];
    expect(writeCardsItemRequired).toEqual(
      expect.arrayContaining(['title', 'blurb', 'fact', 'tags', 'category', 'signal']),
    );
    expect(writeCardsItemRequired).not.toEqual(expect.arrayContaining(['objectID', 'url']));
  });
});
