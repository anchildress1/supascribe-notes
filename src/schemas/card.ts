import * as z from 'zod';

export const TagsSchema = z.object({
  lvl0: z.array(z.string()).optional(),
  lvl1: z.array(z.string()).optional(),
});

export const CardInputSchema = z.object({
  objectID: z.string().uuid().optional(),
  title: z.string().min(1, 'title is required'),
  blurb: z.string().min(1, 'blurb is required'),
  fact: z.string().min(1, 'fact is required'),
  url: z.string().url('url must be a valid URL').optional(),
  tags: TagsSchema,
  projects: z.array(z.string()).optional().default([]),
  category: z.string().min(1, 'category is required'),
  signal: z
    .number()
    .int()
    .min(1, 'signal must be between 1 and 5')
    .max(5, 'signal must be between 1 and 5'),
});

export const WriteCardsInputSchema = z.object({
  cards: z
    .array(CardInputSchema)
    .min(1, 'At least one card is required')
    .max(50, 'Maximum 50 cards per request'),
});

export type CardInput = z.infer<typeof CardInputSchema>;
export type WriteCardsInput = z.infer<typeof WriteCardsInputSchema>;
