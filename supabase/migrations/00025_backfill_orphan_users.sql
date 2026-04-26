-- =============================================================================
-- Backfill orphan users
-- -----------------------------------------------------------------------------
-- Before migration 00024, the JWT hook could silently return NULL org_ids for
-- any user whose handle_new_user trigger failed (EXCEPTION WHEN OTHERS). The
-- result is rows in auth.users with no matching public.org_members — "orphan
-- users" who hit "No organization found for user" on every login.
--
-- This migration repairs those rows by running the same setup that
-- handle_new_user would have done: personal org, profile, org_member, free
-- subscription. It is idempotent: rerunning produces zero new rows once every
-- user has at least one org_member.
-- =============================================================================

DO $$
DECLARE
  orphan RECORD;
  new_org_id uuid;
BEGIN
  FOR orphan IN
    SELECT u.id, u.email, u.raw_user_meta_data
    FROM auth.users u
    LEFT JOIN public.org_members m ON m.user_id = u.id
    WHERE m.user_id IS NULL
  LOOP
    new_org_id := gen_random_uuid();

    INSERT INTO public.orgs (id, name, type)
    VALUES (
      new_org_id,
      COALESCE(NULLIF(trim(orphan.raw_user_meta_data ->> 'full_name'), ''), 'Personal'),
      'personal'
    )
    ON CONFLICT DO NOTHING;

    INSERT INTO public.profiles (id, email, full_name)
    VALUES (
      orphan.id,
      orphan.email,
      NULLIF(trim(orphan.raw_user_meta_data ->> 'full_name'), '')
    )
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.org_members (org_id, user_id, role)
    VALUES (new_org_id, orphan.id, 'owner')
    ON CONFLICT (org_id, user_id) DO NOTHING;

    INSERT INTO public.subscriptions (org_id, plan_tier, status)
    VALUES (new_org_id, 'free', 'active')
    ON CONFLICT DO NOTHING;

    RAISE NOTICE 'Backfilled orphan user % (email=%) with org %',
      orphan.id, orphan.email, new_org_id;
  END LOOP;
END;
$$;
