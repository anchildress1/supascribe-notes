import { describe, it, expect } from 'vitest';
import { renderAuthPage } from '../../../src/views/auth-view.js';
import type { Config } from '../../../src/config.js';

describe('Auth View', () => {
  it('renders auth page with correct config', () => {
    const config: Config = {
      port: 3000,
      supabaseUrl: 'https://test.supabase.co',
      supabaseServiceRoleKey: 'test-key',
      supabaseAnonKey: 'anon-key',
      publicUrl: 'http://localhost:3000',
    };

    const html = renderAuthPage(config);

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Authorize App');
    expect(html).toContain('https://test.supabase.co');
    expect(html).toContain('anon-key');
  });
});
