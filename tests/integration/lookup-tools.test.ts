import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { Express } from 'express';
import type { Server } from 'node:http';
import { createApp } from '../../src/server.js';
import type { Config } from '../../src/config.js';

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
              return Promise.resolve({
                data: mockCards.filter((c) => c.category === val),
                error: null,
              });
            }
            return queryBuilder;
          }),
          ilike: vi.fn().mockImplementation((col, val) => {
            const pattern = val.replace(/%/g, '').toLowerCase();
            return Promise.resolve({
              data: mockCards.filter((c) => c.title.toLowerCase().includes(pattern)),
              error: null,
            });
          }),
          contains: vi.fn().mockImplementation((col, val) => {
            if (col === 'projects') {
              const project = val[0];
              return Promise.resolve({
                data: mockCards.filter((c) => c.projects.includes(project)),
                error: null,
              });
            }
            if (col === 'tags') {
              return Promise.resolve({
                data: mockCards.filter((c) => {
                  if (val.lvl0) return val.lvl0.some((t: string) => c.tags.lvl0.includes(t));
                  if (val.lvl1) return val.lvl1.some((t: string) => c.tags.lvl1.includes(t));
                  return false;
                }),
                error: null,
              });
            }
            return queryBuilder;
          }),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
        return queryBuilder;
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

const testConfig: Config = {
  supabaseUrl: 'http://localhost:54321',
  supabaseServiceRoleKey: 'test-key',
  supabaseAnonKey: 'anon-key',
  port: 0,
  publicUrl: 'http://localhost:0',
};

describe('Lookup Tools Integration', () => {
  let app: Express;
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    app = createApp(testConfig);
    server = app.listen(0);
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    baseUrl = `http://localhost:${port}`;
  });

  afterAll(() => {
    server?.close();
  });

  it('server starts and has status endpoint', async () => {
    const res = await fetch(`${baseUrl}/status`);
    expect(res.status).toBe(200);
  });
});
