import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleLookupCardById,
  handleLookupCategories,
  handleLookupProjects,
  handleLookupTags,
  handleSearchCards,
} from '../../../src/tools/lookup-tools.js';
import type { SupabaseClient } from '@supabase/supabase-js';

describe('Lookup Tools Unit Tests', () => {
  let mockSupabase: unknown;

  beforeEach(() => {
    const createQueryMock = (returnValue: unknown) => {
      const mock = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        ilike: vi.fn().mockReturnThis(),
        contains: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue(returnValue),
        then: vi.fn().mockImplementation((onfulfilled: (value: unknown) => unknown) => {
          return Promise.resolve(returnValue).then(onfulfilled);
        }),
      };
      return mock;
    };

    mockSupabase = createQueryMock({ data: [], error: null });
  });

  it('handleLookupCardById calls supabase correctly', async () => {
    const id = '88888888-8888-8888-8888-888888888888';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = mockSupabase as any;
    supabase.then.mockImplementation((onfulfilled: (value: unknown) => unknown) =>
      Promise.resolve({ data: [{ objectID: id }], error: null }).then(onfulfilled),
    );

    const result = await handleLookupCardById(supabase as SupabaseClient, [id]);

    expect(supabase.from).toHaveBeenCalledWith('cards');
    expect(supabase.in).toHaveBeenCalledWith('objectID', [id]);
    expect(JSON.parse(result.content[0].type === 'text' ? result.content[0].text : '{}')).toEqual({
      cards: [{ objectID: id }],
    });
  });

  it('handleLookupCategories calls supabase correctly', async () => {
    const mockData = { data: [{ category: 'Cat 1' }, { category: 'Cat 2' }], error: null };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = mockSupabase as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase.then.mockImplementation((onfulfilled: any) =>
      Promise.resolve(mockData).then(onfulfilled),
    );

    const result = await handleLookupCategories(supabase as SupabaseClient);

    expect(supabase.from).toHaveBeenCalledWith('unique_categories');
    expect(supabase.select).toHaveBeenCalledWith('category');
    const json = JSON.parse(result.content[0].type === 'text' ? result.content[0].text : '{}');
    expect(json.categories).toEqual(['Cat 1', 'Cat 2']);
  });

  it('handleLookupProjects calls supabase correctly', async () => {
    const mockData = { data: [{ project: 'P1' }, { project: 'P2' }], error: null };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = mockSupabase as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase.then.mockImplementation((onfulfilled: any) =>
      Promise.resolve(mockData).then(onfulfilled),
    );

    const result = await handleLookupProjects(supabase as SupabaseClient);

    expect(supabase.from).toHaveBeenCalledWith('unique_projects');
    expect(supabase.select).toHaveBeenCalledWith('project');
    const json = JSON.parse(result.content[0].type === 'text' ? result.content[0].text : '{}');
    expect(json.projects.sort()).toEqual(['P1', 'P2'].sort());
  });

  it('handleLookupTags calls supabase correctly', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = mockSupabase as any;
    supabase.from.mockImplementation((table: string) => {
      const data = table === 'unique_tags_lvl0' ? [{ tag: 'T0' }] : [{ tag: 'T1' }, { tag: 'T2' }];
      return {
        select: vi.fn().mockReturnThis(),
        then: vi
          .fn()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .mockImplementation((onfulfilled: any) =>
            Promise.resolve({ data, error: null }).then(onfulfilled),
          ),
      };
    });

    const result = await handleLookupTags(supabase as SupabaseClient);

    expect(supabase.from).toHaveBeenCalledWith('unique_tags_lvl0');
    expect(supabase.from).toHaveBeenCalledWith('unique_tags_lvl1');
    const json = JSON.parse(result.content[0].type === 'text' ? result.content[0].text : '{}');
    expect(json.tags.lvl0).toEqual(['T0']);
    expect(json.tags.lvl1.sort()).toEqual(['T1', 'T2'].sort());
  });

  it('handleSearchCards calls supabase with filters', async () => {
    const filters = {
      title: 'Test',
      category: 'Cat',
      project: 'Proj',
      lvl0: ['T0'],
      lvl1: ['T1'],
    };
    const mockData = { data: [{ title: 'Test Card' }], error: null };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = mockSupabase as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase.then.mockImplementation((onfulfilled: any) =>
      Promise.resolve(mockData).then(onfulfilled),
    );

    const result = await handleSearchCards(supabase as SupabaseClient, filters);

    expect(supabase.from).toHaveBeenCalledWith('cards');
    expect(supabase.ilike).toHaveBeenCalledWith('title', '%Test%');
    expect(supabase.eq).toHaveBeenCalledWith('category', 'Cat');
    expect(supabase.contains).toHaveBeenCalledWith('projects', ['Proj']);
    expect(supabase.contains).toHaveBeenCalledWith('tags', { lvl0: ['T0'] });
    expect(supabase.contains).toHaveBeenCalledWith('tags', { lvl1: ['T1'] });
    expect(
      JSON.parse(result.content[0].type === 'text' ? result.content[0].text : '[]'),
    ).toHaveLength(1);
  });

  it('handleSearchCards returns error for empty filters', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = mockSupabase as any;

    const result = await handleSearchCards(supabase as SupabaseClient, {});

    expect(result.isError).toBe(true);
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('At least one search filter');
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
