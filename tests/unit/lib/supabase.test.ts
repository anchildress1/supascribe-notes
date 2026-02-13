import { describe, it, expect } from 'vitest';
import { createSupabaseClient } from '../../../src/lib/supabase.js';

describe('supabase utility', () => {
  it('createSupabaseClient configures the client correctly', () => {
    const url = 'https://example.supabase.co';
    const key = 'test-key';
    const client = createSupabaseClient(url, key);

    expect(client).toBeDefined();
    // We can't easily inspect internal state of SupabaseClient without deep diving,
    // but we can verify it was created with the right URL.
    // @ts-expect-error - accessing internal state for verification
    expect(client.supabaseUrl).toBe(url);
    // @ts-expect-error - accessing internal state for verification
    expect(client.supabaseKey).toBe(key);
  });
});
