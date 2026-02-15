import { describe, it, expect, vi, beforeAll } from 'vitest';
import { createApp } from '../../src/server.js';
import type { Config } from '../../src/config.js';
import { invokeApp } from '../helpers/http.js';

// Mock Supabase client
const mockCards = [
  {
    objectID: '88888888-8888-8888-8888-888888888888',
    title: 'Test Card 1',
    blurb: 'Blurb 1',
    fact: 'Fact 1',
    category: 'Test Category',
    projects: ['Project A'],
    tags: { lvl0: ['Tag 0'], lvl1: ['Tag 1'] },
  },
  {
    objectID: '99999999-9999-9999-9999-999999999999',
    title: 'Another Card',
    blurb: 'Blurb 2',
    fact: 'Fact 2',
    category: 'Other Category',
    projects: ['Project B'],
    tags: { lvl0: ['Other Tag'], lvl1: [] },
  },
];

vi.mock('../../src/lib/supabase.js', () => ({
  createSupabaseClient: vi.fn().mockReturnValue({
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'cards') {
        let result = [...mockCards];
        const queryBuilder = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockImplementation((col, val) => {
            if (col === 'objectID') {
              return {
                maybeSingle: vi.fn().mockResolvedValue({
                  data: mockCards.find((c) => c.objectID === val) || null,
                  error: null,
                }),
              };
            }
            if (col === 'category') {
              result = result.filter((c) => c.category === val);
            }
            return queryBuilder;
          }),
          in: vi.fn().mockImplementation((col, val) => {
            if (col === 'objectID') {
              result = result.filter((c) => val.includes(c.objectID));
            }
            return queryBuilder;
          }),
          ilike: vi.fn().mockImplementation((col, val) => {
            const pattern = val.replace(/%/g, '').toLowerCase();
            if (col === 'title') {
              result = result.filter((c) => c.title.toLowerCase().includes(pattern));
            }
            return queryBuilder;
          }),
          contains: vi.fn().mockImplementation((col, val) => {
            if (col === 'projects') {
              const project = val[0];
              result = result.filter((c) => c.projects.includes(project));
            }
            if (col === 'tags') {
              result = result.filter((c) => {
                if (val.lvl0) return val.lvl0.some((t: string) => c.tags.lvl0.includes(t));
                if (val.lvl1) return val.lvl1.some((t: string) => c.tags.lvl1.includes(t));
                return false;
              });
            }
            return queryBuilder;
          }),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          then: vi.fn((resolve) =>
            resolve({
              data: result,
              error: null,
            }),
          ),
        };
        return queryBuilder;
      }

      if (table === 'unique_categories') {
        return {
          select: vi.fn().mockResolvedValue({
            data: [{ category: 'Other Category' }, { category: 'Test Category' }],
            error: null,
          }),
        };
      }

      if (table === 'unique_projects') {
        return {
          select: vi.fn().mockResolvedValue({
            data: [{ project: 'Project A' }, { project: 'Project B' }],
            error: null,
          }),
        };
      }

      if (table === 'unique_tags_lvl0') {
        return {
          select: vi.fn().mockResolvedValue({
            data: [{ tag: 'Other Tag' }, { tag: 'Tag 0' }],
            error: null,
          }),
        };
      }

      if (table === 'unique_tags_lvl1') {
        return {
          select: vi.fn().mockResolvedValue({
            data: [{ tag: 'Tag 1' }],
            error: null,
          }),
        };
      }

      return {
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockResolvedValue({ error: null }),
      };
    }),
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'test-user', email: 'test@example.com', role: 'authenticated' } },
        error: null,
      }),
    },
  }),
}));

const authHeaders = {
  authorization: 'Bearer test-token',
};

const testConfig: Config = {
  supabaseUrl: 'http://localhost:54321',
  supabaseServiceRoleKey: 'test-key',
  supabaseAnonKey: 'anon-key',
  port: 0,
  publicUrl: 'http://localhost:0',
  serverVersion: '1.0.0',
};

describe('Lookup Tools Integration', () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    app = createApp(testConfig);
  });

  it('server starts and has status endpoint', async () => {
    const { res } = await invokeApp(app, { method: 'GET', url: '/status' });
    expect(res.statusCode).toBe(200);
    const body = res._getJSON() as { status?: string };
    expect(body.status).toBe('ok');
  });

  it('blocks lookup routes without auth', async () => {
    const { res } = await invokeApp(app, { method: 'GET', url: '/api/lookup-categories' });
    expect(res.statusCode).toBe(401);
  });

  it('returns lookup_card_by_id over REST', async () => {
    const { res } = await invokeApp(app, {
      method: 'POST',
      url: '/api/lookup-card-by-id',
      headers: {
        ...authHeaders,
        'content-type': 'application/json',
      },
      body: { id: '88888888-8888-8888-8888-888888888888' },
    });

    expect(res.statusCode).toBe(200);
    const body = res._getJSON() as { objectID: string; title: string };
    expect(body.objectID).toBe('88888888-8888-8888-8888-888888888888');
    expect(body.title).toBe('Test Card 1');
  });

  it('returns lookup_card_by_id results for id arrays over REST', async () => {
    const { res } = await invokeApp(app, {
      method: 'POST',
      url: '/api/lookup-card-by-id',
      headers: {
        ...authHeaders,
        'content-type': 'application/json',
      },
      body: {
        ids: ['88888888-8888-8888-8888-888888888888', '99999999-9999-9999-9999-999999999999'],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res._getJSON() as { cards: Array<{ objectID: string }> };
    expect(body.cards).toHaveLength(2);
    const ids = body.cards.map((card) => card.objectID).sort();
    expect(ids).toEqual([
      '88888888-8888-8888-8888-888888888888',
      '99999999-9999-9999-9999-999999999999',
    ]);
  });

  it('returns categories over REST', async () => {
    const { res } = await invokeApp(app, {
      method: 'GET',
      url: '/api/lookup-categories',
      headers: authHeaders,
    });

    expect(res.statusCode).toBe(200);
    const body = res._getJSON() as { categories: string[] };
    expect(body.categories).toEqual(['Other Category', 'Test Category']);
  });

  it('returns projects over REST', async () => {
    const { res } = await invokeApp(app, {
      method: 'GET',
      url: '/api/lookup-projects',
      headers: authHeaders,
    });

    expect(res.statusCode).toBe(200);
    const body = res._getJSON() as { projects: string[] };
    expect(body.projects).toEqual(['Project A', 'Project B']);
  });

  it('returns tags over REST', async () => {
    const { res } = await invokeApp(app, {
      method: 'GET',
      url: '/api/lookup-tags',
      headers: authHeaders,
    });

    expect(res.statusCode).toBe(200);
    const body = res._getJSON() as { tags: { lvl0: string[]; lvl1: string[] } };
    expect(body.tags.lvl0).toEqual(['Other Tag', 'Tag 0']);
    expect(body.tags.lvl1).toEqual(['Tag 1']);
  });

  it('returns search_cards over REST', async () => {
    const { res } = await invokeApp(app, {
      method: 'POST',
      url: '/api/search-cards',
      headers: {
        ...authHeaders,
        'content-type': 'application/json',
      },
      body: { title: 'another' },
    });

    expect(res.statusCode).toBe(200);
    const body = res._getJSON() as Array<{ objectID: string; title: string }>;
    expect(body).toHaveLength(1);
    expect(body[0].title).toBe('Another Card');
  });

  it('validates search_cards input', async () => {
    const { res } = await invokeApp(app, {
      method: 'POST',
      url: '/api/search-cards',
      headers: {
        ...authHeaders,
        'content-type': 'application/json',
      },
      body: {},
    });

    expect(res.statusCode).toBe(400);
    const body = res._getJSON() as { error: string };
    expect(body.error).toBe('Validation failed');
  });

  it('publishes new operations in openapi.json', async () => {
    const { res } = await invokeApp(app, { method: 'GET', url: '/openapi.json' });
    expect(res.statusCode).toBe(200);
    expect(res._getHeaders()['cache-control']).toContain('no-store');
    const body = res._getJSON() as {
      paths: Record<string, unknown>;
      components: { schemas: Record<string, unknown> };
      info: { version: string };
    };

    expect(body.paths['/api/lookup-card-by-id']).toBeDefined();
    expect(body.paths['/api/lookup-categories']).toBeDefined();
    expect(body.paths['/api/lookup-projects']).toBeDefined();
    expect(body.paths['/api/lookup-tags']).toBeDefined();
    expect(body.paths['/api/search-cards']).toBeDefined();
    expect(body.components.schemas.CardIdInput).toBeDefined();
    expect(body.components.schemas.SearchCardsInput).toBeDefined();
    expect(body.info.version).toBe('1.0.0');
  });
});
