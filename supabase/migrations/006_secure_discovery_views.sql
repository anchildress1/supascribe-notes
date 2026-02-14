-- Secure discovery views so they don't bypass underlying table RLS.
-- These views are used for lookup tools (categories/projects/tags).

-- Ensure view access always runs with the caller's privileges (Postgres 15+).
ALTER VIEW public.unique_categories SET (security_invoker = true);
ALTER VIEW public.unique_projects SET (security_invoker = true);
ALTER VIEW public.unique_tags_lvl0 SET (security_invoker = true);
ALTER VIEW public.unique_tags_lvl1 SET (security_invoker = true);

-- Keep planner from re-ordering predicates across the view boundary.
ALTER VIEW public.unique_categories SET (security_barrier = true);
ALTER VIEW public.unique_projects SET (security_barrier = true);
ALTER VIEW public.unique_tags_lvl0 SET (security_barrier = true);
ALTER VIEW public.unique_tags_lvl1 SET (security_barrier = true);

-- Make the views and their helper function accessible to client roles.
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.jsonb_array_cast(jsonb) TO anon, authenticated;

GRANT SELECT ON TABLE public.unique_categories TO anon, authenticated;
GRANT SELECT ON TABLE public.unique_projects TO anon, authenticated;
GRANT SELECT ON TABLE public.unique_tags_lvl0 TO anon, authenticated;
GRANT SELECT ON TABLE public.unique_tags_lvl1 TO anon, authenticated;
