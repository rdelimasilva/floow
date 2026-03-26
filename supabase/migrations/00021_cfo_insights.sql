-- CFO Insights table
CREATE TABLE cfo_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  category TEXT NOT NULL,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  detail_markdown TEXT,
  metric JSONB NOT NULL DEFAULT '{}',
  correlated_with TEXT[],
  suggested_action_type TEXT,
  suggested_action_params JSONB,
  source TEXT NOT NULL DEFAULT 'cron',
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  dismissed_at TIMESTAMPTZ,
  acted_on_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE cfo_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cfo_insights_select" ON cfo_insights FOR SELECT TO authenticated
  USING (org_id = (current_setting('request.jwt.claims', true)::json -> 'app_metadata' ->> 'org_id')::uuid);

CREATE POLICY "cfo_insights_insert" ON cfo_insights FOR INSERT TO authenticated
  WITH CHECK (org_id = (current_setting('request.jwt.claims', true)::json -> 'app_metadata' ->> 'org_id')::uuid);

CREATE POLICY "cfo_insights_update" ON cfo_insights FOR UPDATE TO authenticated
  USING (org_id = (current_setting('request.jwt.claims', true)::json -> 'app_metadata' ->> 'org_id')::uuid);

CREATE POLICY "cfo_insights_delete" ON cfo_insights FOR DELETE TO authenticated
  USING (org_id = (current_setting('request.jwt.claims', true)::json -> 'app_metadata' ->> 'org_id')::uuid);

CREATE INDEX idx_cfo_insights_org_active
  ON cfo_insights (org_id, severity, generated_at DESC)
  WHERE dismissed_at IS NULL AND expires_at > now();

-- CFO Runs table
CREATE TABLE cfo_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  run_type TEXT NOT NULL,
  trigger_event TEXT NOT NULL DEFAULT 'cron_daily',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  analyzers_run TEXT[] NOT NULL,
  insights_generated INTEGER DEFAULT 0,
  llm_called BOOLEAN DEFAULT FALSE,
  llm_tokens_used INTEGER,
  daily_summary TEXT,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE cfo_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cfo_runs_select" ON cfo_runs FOR SELECT TO authenticated
  USING (org_id = (current_setting('request.jwt.claims', true)::json -> 'app_metadata' ->> 'org_id')::uuid);

CREATE POLICY "cfo_runs_insert" ON cfo_runs FOR INSERT TO authenticated
  WITH CHECK (org_id = (current_setting('request.jwt.claims', true)::json -> 'app_metadata' ->> 'org_id')::uuid);

CREATE INDEX idx_cfo_runs_org_latest
  ON cfo_runs (org_id, run_type, started_at DESC);

CREATE UNIQUE INDEX idx_cfo_runs_debounce
  ON cfo_runs (org_id, trigger_event)
  WHERE started_at > now() - interval '5 minutes';
