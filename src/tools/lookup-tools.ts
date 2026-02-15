import type { SupabaseClient } from '@supabase/supabase-js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { logger } from '../lib/logger.js';

export async function handleLookupCardsById(
  supabase: SupabaseClient,
  ids: string[],
): Promise<CallToolResult> {
  logger.info({ ids }, 'Looking up cards by ID list');
  const { data, error } = await supabase.from('cards').select('*').in('objectID', ids);

  if (error) {
    logger.error({ ids, error }, 'Error looking up cards by ID list');
    return {
      content: [{ type: 'text', text: `Error: ${error.message}` }],
      isError: true,
    };
  }

  return {
    content: [{ type: 'text', text: JSON.stringify({ cards: data ?? [] }) }],
  };
}

export async function handleLookupCategories(supabase: SupabaseClient): Promise<CallToolResult> {
  logger.info('Looking up unique categories');
  const { data, error } = await supabase.from('unique_categories').select('category');

  if (error) {
    logger.error({ error }, 'Error fetching unique categories');
    return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
  }

  const categories = data.map((c: { category: string }) => c.category);
  return { content: [{ type: 'text', text: JSON.stringify({ categories }) }] };
}

export async function handleLookupProjects(supabase: SupabaseClient): Promise<CallToolResult> {
  logger.info('Looking up unique projects');
  const { data, error } = await supabase.from('unique_projects').select('project');

  if (error) {
    logger.error({ error }, 'Error fetching unique projects');
    return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
  }

  const projects = data.map((c: { project: string }) => c.project);
  return { content: [{ type: 'text', text: JSON.stringify({ projects }) }] };
}

export async function handleLookupTags(supabase: SupabaseClient): Promise<CallToolResult> {
  logger.info('Looking up unique tags');
  const [lvl0Res, lvl1Res] = await Promise.all([
    supabase.from('unique_tags_lvl0').select('tag'),
    supabase.from('unique_tags_lvl1').select('tag'),
  ]);

  if (lvl0Res.error || lvl1Res.error) {
    const error = lvl0Res.error || lvl1Res.error;
    logger.error({ error }, 'Error fetching unique tags');
    return { content: [{ type: 'text', text: `Error: ${error?.message}` }], isError: true };
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          tags: {
            lvl0: lvl0Res.data.map((t: { tag: string }) => t.tag),
            lvl1: lvl1Res.data.map((t: { tag: string }) => t.tag),
          },
        }),
      },
    ],
  };
}

export async function handleSearchCards(
  supabase: SupabaseClient,
  filters: {
    title?: string;
    category?: string;
    project?: string;
    lvl0?: string[];
    lvl1?: string[];
  },
): Promise<CallToolResult> {
  const normalizeList = (list?: string[]) =>
    list?.map((value) => value.trim()).filter((value) => value.length > 0);
  const normalizedFilters = {
    title: filters.title?.trim(),
    category: filters.category?.trim(),
    project: filters.project?.trim(),
    lvl0: normalizeList(filters.lvl0),
    lvl1: normalizeList(filters.lvl1),
  };

  const hasFilter =
    Boolean(normalizedFilters.title) ||
    Boolean(normalizedFilters.category) ||
    Boolean(normalizedFilters.project) ||
    (normalizedFilters.lvl0?.length ?? 0) > 0 ||
    (normalizedFilters.lvl1?.length ?? 0) > 0;

  if (!hasFilter) {
    return {
      content: [{ type: 'text', text: 'Error: At least one search filter must be provided.' }],
      isError: true,
    };
  }

  logger.info({ filters: normalizedFilters }, 'Searching cards');
  let query = supabase.from('cards').select('*');

  if (normalizedFilters.title) {
    query = query.ilike('title', `%${normalizedFilters.title}%`);
  }
  if (normalizedFilters.category) {
    query = query.eq('category', normalizedFilters.category);
  }
  if (normalizedFilters.project) {
    query = query.contains('projects', [normalizedFilters.project]);
  }
  if (normalizedFilters.lvl0 && normalizedFilters.lvl0.length > 0) {
    query = query.contains('tags', { lvl0: normalizedFilters.lvl0 });
  }
  if (normalizedFilters.lvl1 && normalizedFilters.lvl1.length > 0) {
    query = query.contains('tags', { lvl1: normalizedFilters.lvl1 });
  }

  const { data, error } = await query;

  if (error) {
    logger.error({ filters: normalizedFilters, error }, 'Error searching cards');
    return {
      content: [{ type: 'text', text: `Error: ${error.message}` }],
      isError: true,
    };
  }

  return {
    content: [{ type: 'text', text: JSON.stringify(data) }],
  };
}
