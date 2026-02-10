-- Card revisions: immutable audit log of every write
CREATE TABLE public.card_revisions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id           uuid NOT NULL REFERENCES public.cards("objectID") ON DELETE CASCADE,
  revision_data     jsonb NOT NULL,
  generation_run_id uuid,
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.card_revisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read revisions"
  ON public.card_revisions FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage revisions"
  ON public.card_revisions FOR ALL
  USING (auth.role() = 'service_role');

-- Index for looking up revisions by card
CREATE INDEX idx_card_revisions_card_id ON public.card_revisions (card_id);

-- Index for looking up revisions by generation run
CREATE INDEX idx_card_revisions_run_id ON public.card_revisions (generation_run_id);
