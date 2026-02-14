-- Address Supabase Security Advisor findings:
-- 1) function_search_path_mutable for public.jsonb_array_cast(jsonb)
-- 2) extension_in_public for pg_trgm

-- Ensure extensions live outside public.
CREATE SCHEMA IF NOT EXISTS extensions;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'pg_trgm'
      AND n.nspname <> 'extensions'
  ) THEN
    EXECUTE 'ALTER EXTENSION pg_trgm SET SCHEMA extensions';
  END IF;
END
$$;

-- Lock function lookup path to prevent role-mutable search_path execution.
ALTER FUNCTION public.jsonb_array_cast(jsonb) SET search_path = '';
