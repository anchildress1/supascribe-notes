import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { handleWriteCards } from '../../../src/tools/write-cards.js';
import type { CardInput } from '../../../src/schemas/card.js';

function createMockSupabase({
  selectResult = { data: null, error: null },
  upsertResult = { error: null },
  cardRevisionsInsertResult = { error: null },
  generationRunsInsertResult = { error: null },
  generationRunsUpdateResult = { error: null },
}: {
  selectResult?: { data: unknown; error: null | { message: string } };
  upsertResult?: { error: null | { message: string } };
  cardRevisionsInsertResult?: { error: null | { message: string } };
  generationRunsInsertResult?: { error: null | { message: string } };
  generationRunsUpdateResult?: { error: null | { message: string } };
} = {}) {
  const selectMock = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue(selectResult),
    }),
  });

  const upsertMock = vi.fn().mockResolvedValue(upsertResult);
  const cardRevisionsInsertMock = vi.fn().mockResolvedValue(cardRevisionsInsertResult);
  const generationRunsInsertMock = vi.fn().mockResolvedValue(generationRunsInsertResult);
  const generationRunsUpdateEqMock = vi.fn().mockResolvedValue(generationRunsUpdateResult);
  const generationRunsUpdateMock = vi.fn().mockReturnValue({
    eq: generationRunsUpdateEqMock,
  });

  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'cards') {
        return { select: selectMock, upsert: upsertMock };
      }
      if (table === 'card_revisions') {
        return { insert: cardRevisionsInsertMock };
      }
      if (table === 'generation_runs') {
        return { insert: generationRunsInsertMock, update: generationRunsUpdateMock };
      }
      return { insert: vi.fn().mockResolvedValue({ error: null }) };
    }),
    _mocks: {
      selectMock,
      upsertMock,
      cardRevisionsInsertMock,
      generationRunsInsertMock,
      generationRunsUpdateMock,
      generationRunsUpdateEqMock,
    },
  } as unknown as SupabaseClient & {
    _mocks: {
      selectMock: ReturnType<typeof vi.fn>;
      upsertMock: ReturnType<typeof vi.fn>;
      cardRevisionsInsertMock: ReturnType<typeof vi.fn>;
      generationRunsInsertMock: ReturnType<typeof vi.fn>;
      generationRunsUpdateMock: ReturnType<typeof vi.fn>;
      generationRunsUpdateEqMock: ReturnType<typeof vi.fn>;
    };
  };
}

const validCard: CardInput = {
  title: 'Test Card',
  blurb: 'A test blurb',
  fact: 'An interesting fact',
  tags: { lvl0: ['tech'] },
  projects: ['project-a'],
  category: 'reference',
  signal: 3,
};

describe('handleWriteCards', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a new card successfully', async () => {
    const supabase = createMockSupabase();
    const result = await handleWriteCards(supabase, [validCard]);

    const body = JSON.parse((result.content[0] as { type: 'text'; text: string }).text);
    expect(body.written).toBe(1);
    expect(body.errors).toBe(0);
    expect(body.results[0].status).toBe('created');
    expect(body.results[0].title).toBe('Test Card');
    expect(body.run_id).toBeDefined();
  });

  it('updates an existing card', async () => {
    const supabase = createMockSupabase({
      selectResult: { data: { objectID: '550e8400-e29b-41d4-a716-446655440000' }, error: null },
    });

    const card = { ...validCard, objectID: '550e8400-e29b-41d4-a716-446655440000' };
    const result = await handleWriteCards(supabase, [card]);

    const body = JSON.parse((result.content[0] as { type: 'text'; text: string }).text);
    expect(body.results[0].status).toBe('updated');
  });

  it('handles upsert failure gracefully', async () => {
    const supabase = createMockSupabase({
      upsertResult: { error: { message: 'Constraint violation' } },
    });
    const result = await handleWriteCards(supabase, [validCard]);

    const body = JSON.parse((result.content[0] as { type: 'text'; text: string }).text);
    expect(body.written).toBe(0);
    expect(body.errors).toBe(1);
    expect(body.error_details[0]).toContain('Constraint violation');
  });

  it('handles multiple cards with mixed results', async () => {
    let callCount = 0;
    const supabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'cards') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
            upsert: vi.fn().mockImplementation(() => {
              callCount++;
              if (callCount === 2) {
                return Promise.resolve({ error: { message: 'Failed' } });
              }
              return Promise.resolve({ error: null });
            }),
          };
        }
        if (table === 'card_revisions') {
          return { insert: vi.fn().mockResolvedValue({ error: null }) };
        }
        if (table === 'generation_runs') {
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }),
    } as unknown as SupabaseClient;

    const cards = [
      { ...validCard, title: 'Card 1' },
      { ...validCard, title: 'Card 2' },
    ];
    const result = await handleWriteCards(supabase, cards);

    const body = JSON.parse((result.content[0] as { type: 'text'; text: string }).text);
    expect(body.written).toBe(1);
    expect(body.errors).toBe(1);
  });

  it('handles card without optional url', async () => {
    const supabase = createMockSupabase();
    const cardWithoutUrl: CardInput = { ...validCard };
    delete (cardWithoutUrl as Record<string, unknown>).url;

    const result = await handleWriteCards(supabase, [cardWithoutUrl]);
    const body = JSON.parse((result.content[0] as { type: 'text'; text: string }).text);
    expect(body.written).toBe(1);
  });

  it('returns isError on catastrophic failure', async () => {
    const supabase = {
      from: vi.fn().mockImplementation(() => {
        throw new Error('Database down');
      }),
    } as unknown as SupabaseClient;

    const result = await handleWriteCards(supabase, [validCard]);
    expect(result.isError).toBe(true);

    const body = JSON.parse((result.content[0] as { type: 'text'; text: string }).text);
    expect(body.written).toBe(0);
    expect(body.errors).toBe(1);
    expect(body.error_details[0]).toContain('Database down');
  });

  it('normalizes provided created_at for historical uploads', async () => {
    const supabase = createMockSupabase();
    const card: CardInput = {
      ...validCard,
      created_at: '2020-01-01T00:00:00-05:00',
    };

    await handleWriteCards(supabase, [card]);

    const upsertPayload = supabase._mocks.upsertMock.mock.calls[0]?.[0] as Record<string, string>;
    expect(upsertPayload.created_at).toBe('2020-01-01T05:00:00.000Z');
  });

  it('omits created_at when not provided to allow database default', async () => {
    const supabase = createMockSupabase();

    await handleWriteCards(supabase, [validCard]);

    const upsertPayload = supabase._mocks.upsertMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(upsertPayload).not.toHaveProperty('created_at');
  });

  it('creates generation run before writing revisions', async () => {
    const supabase = createMockSupabase();

    await handleWriteCards(supabase, [validCard]);

    expect(supabase._mocks.generationRunsInsertMock).toHaveBeenCalledTimes(1);
    expect(supabase._mocks.cardRevisionsInsertMock).toHaveBeenCalledTimes(1);
    expect(supabase._mocks.generationRunsInsertMock.mock.invocationCallOrder[0]).toBeLessThan(
      supabase._mocks.cardRevisionsInsertMock.mock.invocationCallOrder[0],
    );
  });
});
