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
    .preprocess((value) => {
      if (value === null || value === undefined) return undefined;
      if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed.length === 0 ? undefined : trimmed;
      }
      return value;
    }, z.string().url('url must be a valid URL').optional())
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
  created_at: z
    .preprocess(
      (value) => {
        if (value === null || value === undefined) return undefined;
        if (typeof value === 'string') {
          const trimmed = value.trim();
          return trimmed.length === 0 ? undefined : trimmed;
        }
        return value;
      },
      z
        .string()
        .refine((value) => !Number.isNaN(Date.parse(value)), {
          message: 'created_at must be a valid datetime string',
        })
        .optional(),
    )
    .describe(
      'Optional historical creation timestamp. If provided, it will be normalized to ISO-8601 UTC before upsert.',
    ),
});

export const WriteCardsInputSchema = z.object({
  cards: z
    .array(CardInputSchema)
    .min(1, 'At least one card is required')
    .max(50, 'Maximum 50 cards per request')
    .describe('Array of cards to create or update.'),
});

export const EmptyInputSchema = z.object({});

export const CardIdInputSchema = z
  .object({
    ids: z
      .array(z.string().uuid())
      .min(1, 'At least one card id is required')
      .max(50, 'Maximum 50 card ids per request')
      .describe('Array of card UUIDs to lookup.'),
  })
  .strict();

export const SearchCardsInputSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, 'title must not be empty')
      .optional()
      .describe('Search for cards matching this title or title fragment.'),
    category: z
      .string()
      .trim()
      .min(1, 'category must not be empty')
      .optional()
      .describe('Filter by specific category.'),
    project: z
      .string()
      .trim()
      .min(1, 'project must not be empty')
      .optional()
      .describe('Filter by specific project identifier.'),
    lvl0: z
      .array(z.string().trim().min(1, 'lvl0 tag must not be empty'))
      .optional()
      .describe('Filter by specific lvl0 tags.'),
    lvl1: z
      .array(z.string().trim().min(1, 'lvl1 tag must not be empty'))
      .optional()
      .describe('Filter by specific lvl1 tags.'),
  })
  .refine(
    (data) =>
      Boolean(data.title) ||
      Boolean(data.category) ||
      Boolean(data.project) ||
      (data.lvl0?.length ?? 0) > 0 ||
      (data.lvl1?.length ?? 0) > 0,
    { message: 'At least one search filter must be provided.' },
  );

export type CardInput = z.infer<typeof CardInputSchema>;
export type WriteCardsInput = z.infer<typeof WriteCardsInputSchema>;
export type EmptyInput = z.infer<typeof EmptyInputSchema>;
export type CardIdInput = z.infer<typeof CardIdInputSchema>;
export type SearchCardsInput = z.infer<typeof SearchCardsInputSchema>;
