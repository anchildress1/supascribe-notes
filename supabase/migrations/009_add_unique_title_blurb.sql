-- Ensure titles and blurbs are unique to prevent duplicate cards
-- Note: this will fail if duplicates already exist.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.cards
    GROUP BY title
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate titles exist in public.cards';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.cards
    GROUP BY blurb
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate blurbs exist in public.cards';
  END IF;
END
$$;

ALTER TABLE public.cards
  ADD CONSTRAINT cards_title_unique UNIQUE (title);

ALTER TABLE public.cards
  ADD CONSTRAINT cards_blurb_unique UNIQUE (blurb);
