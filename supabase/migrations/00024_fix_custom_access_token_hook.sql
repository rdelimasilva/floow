-- =============================================================================
-- Fix custom_access_token_hook multi-tenant bug
-- -----------------------------------------------------------------------------
-- The original hook in 00001_foundation.sql ran as SECURITY INVOKER, meaning
-- it executed as `supabase_auth_admin` at token-issuance time. Because RLS is
-- enabled on public.org_members with no policies granting access to that role,
-- the SELECT silently returned zero rows — and array_agg of an empty set is
-- NULL. The JWT ended up with `app_metadata.org_ids = null`, so every new
-- user's login threw "No organization found for user" in the app.
--
-- Fix strategy:
-- 1. Recreate the hook as SECURITY DEFINER with a locked search_path so the
--    SELECT bypasses RLS under the function owner's privileges.
-- 2. Belt-and-suspenders: GRANT SELECT and add a permissive RLS policy for
--    supabase_auth_admin, so the hook still works if ownership ever changes.
-- 3. Improve handle_new_user logging without changing its non-blocking
--    behavior.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. Recreate the JWT hook as SECURITY DEFINER
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  claims     jsonb;
  org_ids    uuid[];
  target_uid uuid;
BEGIN
  claims := event -> 'claims';
  target_uid := (event ->> 'user_id')::uuid;

  SELECT array_agg(org_id ORDER BY created_at)
  INTO org_ids
  FROM public.org_members
  WHERE user_id = target_uid;

  -- Always write an array (never null) so consumers can safely index into it.
  claims := jsonb_set(
    claims,
    '{app_metadata, org_ids}',
    to_jsonb(COALESCE(org_ids, ARRAY[]::uuid[]))
  );

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

-- Re-assert grants (idempotent) in case the dashboard reset them
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM authenticated;

-- ----------------------------------------------------------------------------
-- 2. Defensive access for supabase_auth_admin on org_members
--    (redundant with SECURITY DEFINER, but protects against future ownership
--    changes or Supabase tooling that may strip DEFINER.)
-- ----------------------------------------------------------------------------

GRANT SELECT ON public.org_members TO supabase_auth_admin;

DROP POLICY IF EXISTS "org_members: auth admin can read for JWT hook" ON public.org_members;
CREATE POLICY "org_members: auth admin can read for JWT hook"
  ON public.org_members FOR SELECT
  TO supabase_auth_admin
  USING (true);

-- ----------------------------------------------------------------------------
-- 3. Improve handle_new_user diagnostics
--    Keep the non-blocking behavior (we never want to fail signup) but log
--    the SQLSTATE + SQLERRM so we can see exactly what went wrong.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  new_org_id uuid := gen_random_uuid();
BEGIN
  BEGIN
    INSERT INTO public.orgs (id, name, type)
    VALUES (
      new_org_id,
      COALESCE(NULLIF(trim(new.raw_user_meta_data ->> 'full_name'), ''), 'Personal'),
      'personal'
    );

    INSERT INTO public.profiles (id, email, full_name)
    VALUES (
      new.id,
      new.email,
      NULLIF(trim(new.raw_user_meta_data ->> 'full_name'), '')
    );

    INSERT INTO public.org_members (org_id, user_id, role)
    VALUES (new_org_id, new.id, 'owner');

    INSERT INTO public.subscriptions (org_id, plan_tier, status)
    VALUES (new_org_id, 'free', 'active');

  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING
      'handle_new_user failed for user % (email=%): SQLSTATE=% MESSAGE=%',
      new.id, new.email, SQLSTATE, SQLERRM;
  END;

  RETURN new;
END;
$$;
