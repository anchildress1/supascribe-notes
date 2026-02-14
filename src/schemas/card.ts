import * as z from 'zod';

export const TagsSchema = z
  .object({
    lvl0: z
      .array(z.string())
      .optional()
      .describe(
        'Broad, high-level categories or extensive themes. E.g., "Engineering", "Design", "Product".',
      ),
    lvl1: z
      .array(z.string())
      .optional()
      .describe(
        'Specific, granular tags or sub-themes. E.g., "React", "User Research", "Q3 Goals".',
      ),
  })
  .describe('Hierarchical tags for the card. lvl0 are broad categories, lvl1 are specific tags.');

export const CardInputSchema = z.object({
  objectID: z
    .string()
    .uuid()
    .optional()
    .describe('UUID of the card. If not provided, a new one will be generated.'),
  title: z
    .string()
    .min(1, 'title is required')
    .describe('The title of the card. Should be concise and descriptive.'),
  blurb: z
    .string()
    .min(1, 'blurb is required')
    .describe('A short summary or "tweet-sized" description of the card content.'),
  fact: z
    .string()
    .min(1, 'fact is required')
    .describe('The main content or body of the card. Can include markdown.'),
  url: z
    .string()
    .url('url must be a valid URL')
    .optional()
    .describe('Source URL associated with the card content.'),
  tags: TagsSchema,
  projects: z
    .array(z.string())
    .optional()
    .default([])
    .describe('List of project identifiers or names this card belongs to.'),
  category: z
    .string()
    .min(1, 'category is required')
    .describe('The primary category or type of the note.'),
  signal: z
    .number()
    .int()
    .min(1, 'signal must be between 1 and 5')
    .max(5, 'signal must be between 1 and 5')
    .describe('Relevance score or importance signal, from 1 (low) to 5 (high).'),
});

export const WriteCardsInputSchema = z.object({
  cards: z
    .array(CardInputSchema)
    .min(1, 'At least one card is required')
    .max(50, 'Maximum 50 cards per request')
    .describe('Array of cards to create or update.'),
});

export const EmptyInputSchema = z.object({});

export const CardIdInputSchema = z.object({
  id: z.string().uuid().describe('The UUID of the card to lookup.'),
});

export const SearchCardsInputSchema = z.object({
  title: z.string().optional().describe('Search for cards matching this title or title fragment.'),
  category: z.string().optional().describe('Filter by specific category.'),
  project: z.string().optional().describe('Filter by specific project identifier.'),
  lvl0: z.array(z.string()).optional().describe('Filter by specific lvl0 tags.'),
  lvl1: z.array(z.string()).optional().describe('Filter by specific lvl1 tags.'),
});

export type CardInput = z.infer<typeof CardInputSchema>;
export type WriteCardsInput = z.infer<typeof WriteCardsInputSchema>;
export type EmptyInput = z.infer<typeof EmptyInputSchema>;
export type CardIdInput = z.infer<typeof CardIdInputSchema>;
export type SearchCardsInput = z.infer<typeof SearchCardsInputSchema>;
