-- =============================================================================
-- Fix RLS policies: switch from broken scalar `org_id` JWT claim to
-- the `get_user_org_ids()` helper pattern (consistent with 00001_foundation.sql)
-- -----------------------------------------------------------------------------
-- Migrations 00014–00022 wrote policies like:
--   org_id = (current_setting('request.jwt.claims', true)::json
--              -> 'app_metadata' ->> 'org_id')::uuid
--
-- But the JWT hook (custom_access_token_hook) actually injects an ARRAY under
-- the key `org_ids` (plural), not a scalar `org_id`. The scalar key does not
-- exist in the token, so `->>` returns NULL, `NULL::uuid = NULL` is NULL, and
-- every policy evaluates to NULL — which RLS treats as false. Result: all
-- authenticated reads/writes via PostgREST are blocked on these tables.
--
-- The app accidentally worked because Drizzle queries via DATABASE_URL use the
-- `postgres` role (BYPASSRLS), so these policies never got exercised. Isolation
-- today is only at the application layer. This migration restores the
-- defense-in-depth layer by aligning every policy with the foundation pattern:
--   org_id IN (SELECT public.get_user_org_ids())
--
-- Also adds WITH CHECK to UPDATE policies so users can't move a row between
-- their own orgs to a different org mid-update.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- budget_goals
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "budget_goals: org isolation select" ON public.budget_goals;
DROP POLICY IF EXISTS "budget_goals: org isolation insert" ON public.budget_goals;
DROP POLICY IF EXISTS "budget_goals: org isolation update" ON public.budget_goals;
DROP POLICY IF EXISTS "budget_goals: org isolation delete" ON public.budget_goals;
DROP POLICY IF EXISTS "budget_goals: members can select" ON public.budget_goals;
DROP POLICY IF EXISTS "budget_goals: members can insert" ON public.budget_goals;
DROP POLICY IF EXISTS "budget_goals: members can update" ON public.budget_goals;
DROP POLICY IF EXISTS "budget_goals: members can delete" ON public.budget_goals;

CREATE POLICY "budget_goals: members can select"
  ON public.budget_goals FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "budget_goals: members can insert"
  ON public.budget_goals FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "budget_goals: members can update"
  ON public.budget_goals FOR UPDATE TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "budget_goals: members can delete"
  ON public.budget_goals FOR DELETE TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

-- ----------------------------------------------------------------------------
-- budget_category_limits (child of budget_goals)
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "budget_category_limits: org isolation select" ON public.budget_category_limits;
DROP POLICY IF EXISTS "budget_category_limits: org isolation insert" ON public.budget_category_limits;
DROP POLICY IF EXISTS "budget_category_limits: org isolation update" ON public.budget_category_limits;
DROP POLICY IF EXISTS "budget_category_limits: org isolation delete" ON public.budget_category_limits;
DROP POLICY IF EXISTS "budget_category_limits: members can select" ON public.budget_category_limits;
DROP POLICY IF EXISTS "budget_category_limits: members can insert" ON public.budget_category_limits;
DROP POLICY IF EXISTS "budget_category_limits: members can update" ON public.budget_category_limits;
DROP POLICY IF EXISTS "budget_category_limits: members can delete" ON public.budget_category_limits;

CREATE POLICY "budget_category_limits: members can select"
  ON public.budget_category_limits FOR SELECT TO authenticated
  USING (
    budget_goal_id IN (
      SELECT id FROM public.budget_goals
      WHERE org_id IN (SELECT public.get_user_org_ids())
    )
  );

CREATE POLICY "budget_category_limits: members can insert"
  ON public.budget_category_limits FOR INSERT TO authenticated
  WITH CHECK (
    budget_goal_id IN (
      SELECT id FROM public.budget_goals
      WHERE org_id IN (SELECT public.get_user_org_ids())
    )
  );

CREATE POLICY "budget_category_limits: members can update"
  ON public.budget_category_limits FOR UPDATE TO authenticated
  USING (
    budget_goal_id IN (
      SELECT id FROM public.budget_goals
      WHERE org_id IN (SELECT public.get_user_org_ids())
    )
  )
  WITH CHECK (
    budget_goal_id IN (
      SELECT id FROM public.budget_goals
      WHERE org_id IN (SELECT public.get_user_org_ids())
    )
  );

CREATE POLICY "budget_category_limits: members can delete"
  ON public.budget_category_limits FOR DELETE TO authenticated
  USING (
    budget_goal_id IN (
      SELECT id FROM public.budget_goals
      WHERE org_id IN (SELECT public.get_user_org_ids())
    )
  );

-- ----------------------------------------------------------------------------
-- budget_adjustments (child of budget_goals)
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "budget_adjustments: org isolation select" ON public.budget_adjustments;
DROP POLICY IF EXISTS "budget_adjustments: org isolation insert" ON public.budget_adjustments;
DROP POLICY IF EXISTS "budget_adjustments: org isolation update" ON public.budget_adjustments;
DROP POLICY IF EXISTS "budget_adjustments: org isolation delete" ON public.budget_adjustments;
DROP POLICY IF EXISTS "budget_adjustments: members can select" ON public.budget_adjustments;
DROP POLICY IF EXISTS "budget_adjustments: members can insert" ON public.budget_adjustments;
DROP POLICY IF EXISTS "budget_adjustments: members can update" ON public.budget_adjustments;
DROP POLICY IF EXISTS "budget_adjustments: members can delete" ON public.budget_adjustments;

CREATE POLICY "budget_adjustments: members can select"
  ON public.budget_adjustments FOR SELECT TO authenticated
  USING (
    budget_goal_id IN (
      SELECT id FROM public.budget_goals
      WHERE org_id IN (SELECT public.get_user_org_ids())
    )
  );

CREATE POLICY "budget_adjustments: members can insert"
  ON public.budget_adjustments FOR INSERT TO authenticated
  WITH CHECK (
    budget_goal_id IN (
      SELECT id FROM public.budget_goals
      WHERE org_id IN (SELECT public.get_user_org_ids())
    )
  );

CREATE POLICY "budget_adjustments: members can update"
  ON public.budget_adjustments FOR UPDATE TO authenticated
  USING (
    budget_goal_id IN (
      SELECT id FROM public.budget_goals
      WHERE org_id IN (SELECT public.get_user_org_ids())
    )
  )
  WITH CHECK (
    budget_goal_id IN (
      SELECT id FROM public.budget_goals
      WHERE org_id IN (SELECT public.get_user_org_ids())
    )
  );

CREATE POLICY "budget_adjustments: members can delete"
  ON public.budget_adjustments FOR DELETE TO authenticated
  USING (
    budget_goal_id IN (
      SELECT id FROM public.budget_goals
      WHERE org_id IN (SELECT public.get_user_org_ids())
    )
  );

-- ----------------------------------------------------------------------------
-- budget_entries
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "budget_entries: org isolation select" ON public.budget_entries;
DROP POLICY IF EXISTS "budget_entries: org isolation insert" ON public.budget_entries;
DROP POLICY IF EXISTS "budget_entries: org isolation update" ON public.budget_entries;
DROP POLICY IF EXISTS "budget_entries: org isolation delete" ON public.budget_entries;
DROP POLICY IF EXISTS "budget_entries: members can select" ON public.budget_entries;
DROP POLICY IF EXISTS "budget_entries: members can insert" ON public.budget_entries;
DROP POLICY IF EXISTS "budget_entries: members can update" ON public.budget_entries;
DROP POLICY IF EXISTS "budget_entries: members can delete" ON public.budget_entries;

CREATE POLICY "budget_entries: members can select"
  ON public.budget_entries FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "budget_entries: members can insert"
  ON public.budget_entries FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "budget_entries: members can update"
  ON public.budget_entries FOR UPDATE TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "budget_entries: members can delete"
  ON public.budget_entries FOR DELETE TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

-- ----------------------------------------------------------------------------
-- debts
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "debts: org isolation select" ON public.debts;
DROP POLICY IF EXISTS "debts: org isolation insert" ON public.debts;
DROP POLICY IF EXISTS "debts: org isolation update" ON public.debts;
DROP POLICY IF EXISTS "debts: org isolation delete" ON public.debts;
DROP POLICY IF EXISTS "debts: members can select" ON public.debts;
DROP POLICY IF EXISTS "debts: members can insert" ON public.debts;
DROP POLICY IF EXISTS "debts: members can update" ON public.debts;
DROP POLICY IF EXISTS "debts: members can delete" ON public.debts;

CREATE POLICY "debts: members can select"
  ON public.debts FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "debts: members can insert"
  ON public.debts FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "debts: members can update"
  ON public.debts FOR UPDATE TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "debts: members can delete"
  ON public.debts FOR DELETE TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

-- ----------------------------------------------------------------------------
-- cfo_insights
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "cfo_insights_select" ON public.cfo_insights;
DROP POLICY IF EXISTS "cfo_insights_insert" ON public.cfo_insights;
DROP POLICY IF EXISTS "cfo_insights_update" ON public.cfo_insights;
DROP POLICY IF EXISTS "cfo_insights_delete" ON public.cfo_insights;
DROP POLICY IF EXISTS "cfo_insights: members can select" ON public.cfo_insights;
DROP POLICY IF EXISTS "cfo_insights: members can insert" ON public.cfo_insights;
DROP POLICY IF EXISTS "cfo_insights: members can update" ON public.cfo_insights;
DROP POLICY IF EXISTS "cfo_insights: members can delete" ON public.cfo_insights;

CREATE POLICY "cfo_insights: members can select"
  ON public.cfo_insights FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "cfo_insights: members can insert"
  ON public.cfo_insights FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "cfo_insights: members can update"
  ON public.cfo_insights FOR UPDATE TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "cfo_insights: members can delete"
  ON public.cfo_insights FOR DELETE TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

-- ----------------------------------------------------------------------------
-- cfo_runs (intentionally no UPDATE/DELETE — written once by cron, read-only
-- from the client's perspective)
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "cfo_runs_select" ON public.cfo_runs;
DROP POLICY IF EXISTS "cfo_runs_insert" ON public.cfo_runs;
DROP POLICY IF EXISTS "cfo_runs: members can select" ON public.cfo_runs;
DROP POLICY IF EXISTS "cfo_runs: members can insert" ON public.cfo_runs;

CREATE POLICY "cfo_runs: members can select"
  ON public.cfo_runs FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "cfo_runs: members can insert"
  ON public.cfo_runs FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT public.get_user_org_ids()));

-- ----------------------------------------------------------------------------
-- cfo_conversations
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "cfo_conversations_select" ON public.cfo_conversations;
DROP POLICY IF EXISTS "cfo_conversations_insert" ON public.cfo_conversations;
DROP POLICY IF EXISTS "cfo_conversations_update" ON public.cfo_conversations;
DROP POLICY IF EXISTS "cfo_conversations_delete" ON public.cfo_conversations;
DROP POLICY IF EXISTS "cfo_conversations: members can select" ON public.cfo_conversations;
DROP POLICY IF EXISTS "cfo_conversations: members can insert" ON public.cfo_conversations;
DROP POLICY IF EXISTS "cfo_conversations: members can update" ON public.cfo_conversations;
DROP POLICY IF EXISTS "cfo_conversations: members can delete" ON public.cfo_conversations;

CREATE POLICY "cfo_conversations: members can select"
  ON public.cfo_conversations FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "cfo_conversations: members can insert"
  ON public.cfo_conversations FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "cfo_conversations: members can update"
  ON public.cfo_conversations FOR UPDATE TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "cfo_conversations: members can delete"
  ON public.cfo_conversations FOR DELETE TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));

-- ----------------------------------------------------------------------------
-- cfo_messages (child of cfo_conversations)
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "cfo_messages_select" ON public.cfo_messages;
DROP POLICY IF EXISTS "cfo_messages_insert" ON public.cfo_messages;
DROP POLICY IF EXISTS "cfo_messages_delete" ON public.cfo_messages;
DROP POLICY IF EXISTS "cfo_messages: members can select" ON public.cfo_messages;
DROP POLICY IF EXISTS "cfo_messages: members can insert" ON public.cfo_messages;
DROP POLICY IF EXISTS "cfo_messages: members can delete" ON public.cfo_messages;

CREATE POLICY "cfo_messages: members can select"
  ON public.cfo_messages FOR SELECT TO authenticated
  USING (
    conversation_id IN (
      SELECT id FROM public.cfo_conversations
      WHERE org_id IN (SELECT public.get_user_org_ids())
    )
  );

CREATE POLICY "cfo_messages: members can insert"
  ON public.cfo_messages FOR INSERT TO authenticated
  WITH CHECK (
    conversation_id IN (
      SELECT id FROM public.cfo_conversations
      WHERE org_id IN (SELECT public.get_user_org_ids())
    )
  );

CREATE POLICY "cfo_messages: members can delete"
  ON public.cfo_messages FOR DELETE TO authenticated
  USING (
    conversation_id IN (
      SELECT id FROM public.cfo_conversations
      WHERE org_id IN (SELECT public.get_user_org_ids())
    )
  );
