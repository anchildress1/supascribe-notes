-- Generation runs: logs each tool invocation
CREATE TABLE public.generation_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_name     text NOT NULL,
  cards_written integer NOT NULL DEFAULT 0,
  status        text NOT NULL CHECK (status IN ('success', 'partial', 'error')),
  error         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.generation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read runs"
  ON public.generation_runs FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage runs"
  ON public.generation_runs FOR ALL
  USING (auth.role() = 'service_role');

-- Add FK from card_revisions to generation_runs
ALTER TABLE public.card_revisions
  ADD CONSTRAINT fk_card_revisions_run
  FOREIGN KEY (generation_run_id) REFERENCES public.generation_runs(id) ON DELETE SET NULL;
