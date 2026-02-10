import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { handleHealth } from '../../../src/tools/health.js';

function createMockSupabase(selectResult: { error: null | { message: string } }) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockResolvedValue(selectResult),
    }),
  } as unknown as SupabaseClient;
}

describe('handleHealth', () => {
  it('returns ok when Supabase is connected', async () => {
    const supabase = createMockSupabase({ error: null });
    const result = await handleHealth(supabase);

    expect(result.content).toHaveLength(1);
    const body = JSON.parse((result.content[0] as { type: 'text'; text: string }).text);
    expect(body.status).toBe('ok');
    expect(body.supabase.connected).toBe(true);
    expect(body.timestamp).toBeDefined();
  });

  it('returns degraded when Supabase query fails', async () => {
    const supabase = createMockSupabase({ error: { message: 'Connection refused' } });
    const result = await handleHealth(supabase);

    const body = JSON.parse((result.content[0] as { type: 'text'; text: string }).text);
    expect(body.status).toBe('degraded');
    expect(body.supabase.connected).toBe(false);
    expect(body.supabase.error).toBe('Connection refused');
  });

  it('returns error when Supabase throws', async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockRejectedValue(new Error('Network failure')),
      }),
    } as unknown as SupabaseClient;

    const result = await handleHealth(supabase);
    const body = JSON.parse((result.content[0] as { type: 'text'; text: string }).text);
    expect(body.status).toBe('error');
    expect(body.supabase.error).toBe('Network failure');
  });
});
