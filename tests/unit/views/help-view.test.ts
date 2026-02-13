import { describe, it, expect } from 'vitest';
import { renderHelpPage } from '../../../src/views/help-view.js';

describe('Help View', () => {
  it('renders help page', () => {
    const html = renderHelpPage();

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Supabase MCP Server');
    expect(html).toContain('Model Context Protocol (MCP) server for Supabase');
  });
});
