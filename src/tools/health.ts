import type { SupabaseClient } from '@supabase/supabase-js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export async function handleHealth(supabase: SupabaseClient): Promise<CallToolResult> {
  const timestamp = new Date().toISOString();

  try {
    const { error } = await supabase.from('cards').select('count', { count: 'exact', head: true });

    if (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'degraded',
              timestamp,
              supabase: { connected: false, error: error.message },
            }),
          },
        ],
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'ok',
            timestamp,
            supabase: { connected: true },
          }),
        },
      ],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'error',
            timestamp,
            supabase: { connected: false, error: message },
          }),
        },
      ],
    };
  }
}
