-- Cards table: stores the latest version of each index card
CREATE TABLE public.cards (
  "objectID"   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL,
  blurb        text NOT NULL,
  fact         text NOT NULL,
  url          text,
  tags         jsonb NOT NULL DEFAULT '{}',
  projects     text[] NOT NULL DEFAULT '{}',
  category     text NOT NULL,
  signal       smallint NOT NULL CHECK (signal BETWEEN 1 AND 5),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- RLS: public read, service-role write
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read cards"
  ON public.cards FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage cards"
  ON public.cards FOR ALL
  USING (auth.role() = 'service_role');

-- Index for category-based lookups
CREATE INDEX idx_cards_category ON public.cards (category);

-- Index for signal-based ordering
CREATE INDEX idx_cards_signal ON public.cards (signal DESC);
