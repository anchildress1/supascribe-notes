import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { CardInput } from '../schemas/card.js';
import { logger } from '../lib/logger.js';

interface WriteResult {
  objectID: string;
  title: string;
  status: 'created' | 'updated';
}

export async function handleWriteCards(
  supabase: SupabaseClient,
  cards: CardInput[],
): Promise<CallToolResult> {
  const runId = randomUUID();
  logger.info({ runId, cardCount: cards.length }, 'Starting write_cards execution');
  const results: WriteResult[] = [];
  const errors: string[] = [];

  try {
    for (const card of cards) {
      try {
        const objectID = card.objectID ?? randomUUID();
        const now = new Date().toISOString();
        const createdAtInput =
          typeof card.created_at === 'string' ? card.created_at.trim() : undefined;
        const createdAt = createdAtInput ? new Date(createdAtInput).toISOString() : undefined;

        const row = {
          objectID,
          title: card.title,
          blurb: card.blurb,
          fact: card.fact,
          url: card.url,
          tags: card.tags,
          projects: card.projects,
          category: card.category,
          signal: card.signal,
          ...(createdAt ? { created_at: createdAt } : {}),
          updated_at: now,
        };

        // Check if card exists to determine created vs updated
        const { data: existing } = await supabase
          .from('cards')
          .select('"objectID"')
          .eq('objectID', objectID)
          .maybeSingle();

        const isUpdate = !!existing;

        // Upsert card
        const { error: upsertError } = await supabase
          .from('cards')
          .upsert(row, { onConflict: 'objectID' });

        if (upsertError) {
          const msg = `Card "${card.title}": ${upsertError.message}`;
          logger.error({ runId, card: card.title, error: upsertError }, 'Failed to upsert card');
          errors.push(msg);
          continue;
        }

        // Insert revision
        const { error: revisionError } = await supabase.from('card_revisions').insert({
          card_id: objectID,
          revision_data: row,
          generation_run_id: runId,
        });

        if (revisionError) {
          errors.push(`Revision for "${card.title}": ${revisionError.message}`);
        }

        results.push({
          objectID,
          title: card.title,
          status: isUpdate ? 'updated' : 'created',
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        logger.error({ runId, card: card.title, error: err }, 'Unexpected error processing card');
        errors.push(`Card "${card.title}": ${message}`);
      }
    }

    // Log generation run
    await supabase.from('generation_runs').insert({
      id: runId,
      tool_name: 'write_cards',
      cards_written: results.length,
      status: errors.length > 0 ? 'partial' : 'success',
      error: errors.length > 0 ? errors.join('; ') : null,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            run_id: runId,
            written: results.length,
            errors: errors.length,
            results,
            ...(errors.length > 0 ? { error_details: errors } : {}),
          }),
        },
      ],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';

    // Attempt to log failed run
    try {
      await supabase.from('generation_runs').insert({
        id: runId,
        tool_name: 'write_cards',
        cards_written: results.length,
        status: 'error',
        error: message,
      });
    } catch {
      // Swallow logging failure
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            run_id: runId,
            error: message,
            written: results.length,
          }),
        },
      ],
      isError: true,
    };
  }
}
