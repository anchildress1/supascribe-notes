import { describe, it, expect } from 'vitest';
import {
  CardInputSchema,
  WriteCardsInputSchema,
  TagsSchema,
  SearchCardsInputSchema,
} from '../../../src/schemas/card.js';

describe('TagsSchema', () => {
  it('accepts empty object', () => {
    expect(TagsSchema.parse({})).toEqual({});
  });

  it('accepts lvl0 only', () => {
    expect(TagsSchema.parse({ lvl0: ['a', 'b'] })).toEqual({ lvl0: ['a', 'b'] });
  });

  it('accepts both lvl0 and lvl1', () => {
    const tags = { lvl0: ['tech'], lvl1: ['ai', 'ml'] };
    expect(TagsSchema.parse(tags)).toEqual(tags);
  });
});

describe('CardInputSchema', () => {
  const validCard = {
    title: 'Test Card',
    blurb: 'A test blurb',
    fact: 'An interesting fact',
    url: 'https://example.com',
    tags: { lvl0: ['tech'] },
    projects: ['project-a'],
    category: 'reference',
    signal: 3,
  };

  it('accepts a valid card with all fields', () => {
    const result = CardInputSchema.parse(validCard);
    expect(result.title).toBe('Test Card');
    expect(result.signal).toBe(3);
  });

  it('accepts a card without optional objectID', () => {
    const result = CardInputSchema.parse(validCard);
    expect(result.objectID).toBeUndefined();
  });

  it('accepts a valid objectID', () => {
    const card = { ...validCard, objectID: '550e8400-e29b-41d4-a716-446655440000' };
    const result = CardInputSchema.parse(card);
    expect(result.objectID).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('accepts a card without url (optional)', () => {
    const { url: _, ...cardWithoutUrl } = validCard;
    const result = CardInputSchema.parse(cardWithoutUrl);
    expect(result.url).toBeUndefined();
  });

  it('accepts a card without projects (defaults to empty array)', () => {
    const { projects: _, ...cardWithoutProjects } = validCard;
    const result = CardInputSchema.parse(cardWithoutProjects);
    expect(result.projects).toEqual([]);
  });

  it('rejects empty title', () => {
    expect(() => CardInputSchema.parse({ ...validCard, title: '' })).toThrow();
  });

  it('rejects empty blurb', () => {
    expect(() => CardInputSchema.parse({ ...validCard, blurb: '' })).toThrow();
  });

  it('rejects empty fact', () => {
    expect(() => CardInputSchema.parse({ ...validCard, fact: '' })).toThrow();
  });

  it('rejects invalid url', () => {
    expect(() => CardInputSchema.parse({ ...validCard, url: 'not-a-url' })).toThrow();
  });

  it('rejects signal below 1', () => {
    expect(() => CardInputSchema.parse({ ...validCard, signal: 0 })).toThrow();
  });

  it('rejects signal above 5', () => {
    expect(() => CardInputSchema.parse({ ...validCard, signal: 6 })).toThrow();
  });

  it('rejects non-integer signal', () => {
    expect(() => CardInputSchema.parse({ ...validCard, signal: 2.5 })).toThrow();
  });

  it('rejects invalid objectID format', () => {
    expect(() => CardInputSchema.parse({ ...validCard, objectID: 'not-a-uuid' })).toThrow();
  });

  it('accepts empty created_at by defaulting it', () => {
    const result = CardInputSchema.parse({ ...validCard, created_at: '   ' });
    expect(result.created_at).toBeUndefined();
  });

  it('accepts created_at when provided', () => {
    const created_at = '2020-01-01T00:00:00Z';
    const result = CardInputSchema.parse({ ...validCard, created_at: `  ${created_at}  ` });
    expect(result.created_at).toBe(created_at);
  });
});

describe('WriteCardsInputSchema', () => {
  const validCard = {
    title: 'Card',
    blurb: 'Blurb',
    fact: 'Fact',
    tags: {},
    category: 'test',
    signal: 1,
  };

  it('accepts an array with one card', () => {
    const result = WriteCardsInputSchema.parse({ cards: [validCard] });
    expect(result.cards).toHaveLength(1);
  });

  it('rejects empty cards array', () => {
    expect(() => WriteCardsInputSchema.parse({ cards: [] })).toThrow();
  });

  it('rejects more than 50 cards', () => {
    const cards = Array.from({ length: 51 }, () => validCard);
    expect(() => WriteCardsInputSchema.parse({ cards })).toThrow();
  });
});

describe('SearchCardsInputSchema', () => {
  it('accepts at least one filter', () => {
    const result = SearchCardsInputSchema.parse({ title: 'Test' });
    expect(result.title).toBe('Test');
  });

  it('rejects empty filters', () => {
    expect(() => SearchCardsInputSchema.parse({})).toThrow();
  });
});
