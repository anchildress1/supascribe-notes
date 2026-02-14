-- Index for project-based lookups
-- Using GIN because projects is a text array
CREATE INDEX IF NOT EXISTS idx_cards_projects ON public.cards USING GIN (projects);

-- Index for tag-based lookups
-- Using GIN because tags is a JSONB object containing lvl0 and lvl1 arrays
CREATE INDEX IF NOT EXISTS idx_cards_tags ON public.cards USING GIN (tags);

-- Index for title-based lookups
-- Using pg_trgm to accelerate substring matches
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_cards_title_trgm ON public.cards USING GIN (title gin_trgm_ops);
