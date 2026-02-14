-- Helper function to cast jsonb array to text array for unnesting
CREATE OR REPLACE FUNCTION jsonb_array_cast(jsonb) RETURNS text[] AS $$
  SELECT ARRAY(SELECT jsonb_array_elements_text($1));
$$ LANGUAGE sql IMMUTABLE;

-- View for unique categories
CREATE OR REPLACE VIEW public.unique_categories AS
SELECT DISTINCT category
FROM public.cards
ORDER BY category;

-- View for unique projects
CREATE OR REPLACE VIEW public.unique_projects AS
SELECT DISTINCT unnest(projects) AS project
FROM public.cards
WHERE projects IS NOT NULL
ORDER BY project;

-- View for unique tags (lvl0)
CREATE OR REPLACE VIEW public.unique_tags_lvl0 AS
SELECT DISTINCT unnest(jsonb_array_cast(tags->'lvl0')) AS tag
FROM public.cards
WHERE tags ? 'lvl0'
ORDER BY tag;

-- View for unique tags (lvl1)
CREATE OR REPLACE VIEW public.unique_tags_lvl1 AS
SELECT DISTINCT unnest(jsonb_array_cast(tags->'lvl1')) AS tag
FROM public.cards
WHERE tags ? 'lvl1'
ORDER BY tag;
