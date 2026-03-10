-- =============================================================================
-- Floow Foundation Migration 00001
-- Multi-tenant schema with RLS policies, triggers, and JWT claims hook
-- =============================================================================

-- ----------------------------------------------------------------------------
-- ENUMS
-- ----------------------------------------------------------------------------

CREATE TYPE org_type AS ENUM ('personal', 'business');
CREATE TYPE member_role AS ENUM ('owner', 'admin', 'member', 'viewer');
CREATE TYPE plan_tier AS ENUM ('free', 'pro');
CREATE TYPE subscription_status AS ENUM ('active', 'canceled', 'past_due', 'trialing', 'incomplete');

-- ----------------------------------------------------------------------------
-- TABLES
-- ----------------------------------------------------------------------------

CREATE TABLE public.orgs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  type        org_type NOT NULL DEFAULT 'personal',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.profiles (
  -- id is the Supabase auth.users UUID — 1:1 mapping
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       text NOT NULL,
  full_name   text,
  avatar_url  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.org_members (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        member_role NOT NULL DEFAULT 'member',
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, user_id)
);

CREATE TABLE public.subscriptions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  plan_tier               plan_tier NOT NULL DEFAULT 'free',
  stripe_customer_id      text UNIQUE,
  stripe_subscription_id  text UNIQUE,
  stripe_price_id         text,
  status                  subscription_status NOT NULL DEFAULT 'active',
  current_period_end      timestamptz,
  cancel_at_period_end    boolean NOT NULL DEFAULT false,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- INDEXES (CRITICAL for RLS performance)
-- Without these, RLS causes full table scans on large tables
-- ----------------------------------------------------------------------------

CREATE INDEX idx_org_members_user_id ON public.org_members USING btree (user_id);
CREATE INDEX idx_org_members_org_id  ON public.org_members USING btree (org_id);
CREATE INDEX idx_subscriptions_org_id ON public.subscriptions USING btree (org_id);
CREATE INDEX idx_profiles_id ON public.profiles USING btree (id);

-- ----------------------------------------------------------------------------
-- SECURITY DEFINER HELPER FUNCTION
-- Performant RLS: avoids nested RLS lookups on org_members per-row
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_user_org_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT org_id FROM public.org_members WHERE user_id = (SELECT auth.uid())
$$;

-- Grant execute to authenticated users; revoke from public
REVOKE ALL ON FUNCTION public.get_user_org_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_org_ids() TO authenticated;

-- ----------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- Enable RLS on ALL tables — enforces multi-tenant isolation at DB level
-- Pattern: always use (select auth.uid()) not bare auth.uid() for performance
-- ----------------------------------------------------------------------------

-- orgs: users can see orgs they belong to; only owners can modify
ALTER TABLE public.orgs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orgs: members can select"
  ON public.orgs FOR SELECT
  TO authenticated
  USING (id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "orgs: owners can insert"
  ON public.orgs FOR INSERT
  TO authenticated
  WITH CHECK (true); -- Insertable by authenticated (trigger creates orgs on signup)

CREATE POLICY "orgs: owners can update"
  ON public.orgs FOR UPDATE
  TO authenticated
  USING (
    id IN (
      SELECT org_id FROM public.org_members
      WHERE user_id = (SELECT auth.uid())
        AND role = 'owner'
    )
  );

CREATE POLICY "orgs: owners can delete"
  ON public.orgs FOR DELETE
  TO authenticated
  USING (
    id IN (
      SELECT org_id FROM public.org_members
      WHERE user_id = (SELECT auth.uid())
        AND role = 'owner'
    )
  );

-- profiles: users can only access their own profile
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles: user can select own"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (id = (SELECT auth.uid()));

CREATE POLICY "profiles: user can insert own"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = (SELECT auth.uid()));

CREATE POLICY "profiles: user can update own"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = (SELECT auth.uid()));

CREATE POLICY "profiles: user can delete own"
  ON public.profiles FOR DELETE
  TO authenticated
  USING (id = (SELECT auth.uid()));

-- org_members: users can see members of their orgs; owners/admins can manage
ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members: members can select"
  ON public.org_members FOR SELECT
  TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "org_members: owners and admins can insert"
  ON public.org_members FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM public.org_members
      WHERE user_id = (SELECT auth.uid())
        AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "org_members: owners and admins can update"
  ON public.org_members FOR UPDATE
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM public.org_members
      WHERE user_id = (SELECT auth.uid())
        AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "org_members: owners can delete"
  ON public.org_members FOR DELETE
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM public.org_members
      WHERE user_id = (SELECT auth.uid())
        AND role = 'owner'
    )
  );

-- subscriptions: org members can see their org's subscription; owners can modify
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subscriptions: members can select"
  ON public.subscriptions FOR SELECT
  TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "subscriptions: owners can insert"
  ON public.subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM public.org_members
      WHERE user_id = (SELECT auth.uid())
        AND role = 'owner'
    )
  );

CREATE POLICY "subscriptions: owners can update"
  ON public.subscriptions FOR UPDATE
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM public.org_members
      WHERE user_id = (SELECT auth.uid())
        AND role = 'owner'
    )
  );

-- ----------------------------------------------------------------------------
-- ON_AUTH_USER_CREATED TRIGGER
-- Auto-creates personal org, profile, org_member, and free subscription on signup
-- CRITICAL: Wrapped in EXCEPTION handler to prevent signup failures
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
    -- Create personal org named after the user (fallback: 'Personal')
    INSERT INTO public.orgs (id, name, type)
    VALUES (
      new_org_id,
      COALESCE(new.raw_user_meta_data ->> 'full_name', 'Personal'),
      'personal'
    );

    -- Create user profile (1:1 with auth.users)
    INSERT INTO public.profiles (id, email, full_name)
    VALUES (
      new.id,
      new.email,
      new.raw_user_meta_data ->> 'full_name'
    );

    -- Add user as owner of their personal org
    INSERT INTO public.org_members (org_id, user_id, role)
    VALUES (new_org_id, new.id, 'owner');

    -- Create free subscription for the new org (every org starts on free plan)
    INSERT INTO public.subscriptions (org_id, plan_tier, status)
    VALUES (new_org_id, 'free', 'active');

  EXCEPTION WHEN OTHERS THEN
    -- Log error but do NOT re-raise — prevents blocking user signup
    RAISE WARNING 'handle_new_user failed for user %: %', new.id, SQLERRM;
  END;

  RETURN new;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_new_user();

-- ----------------------------------------------------------------------------
-- CUSTOM ACCESS TOKEN HOOK (JWT org_id claims)
-- Injects user's org_ids into JWT app_metadata for RLS optimization
-- Registered in Supabase Dashboard: Auth > Hooks > Custom Access Token
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  claims  jsonb;
  org_ids uuid[];
BEGIN
  claims := event -> 'claims';

  -- Fetch all org IDs the user belongs to
  SELECT array_agg(org_id)
  INTO org_ids
  FROM public.org_members
  WHERE user_id = (event ->> 'user_id')::uuid;

  -- Inject org_ids array into JWT app_metadata
  claims := jsonb_set(claims, '{app_metadata, org_ids}', to_jsonb(org_ids));

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

-- Security: restrict access to the hook function
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM anon;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated;
