CREATE TABLE cfo_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  title TEXT,
  insight_id UUID REFERENCES cfo_insights(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE cfo_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cfo_conversations_select" ON cfo_conversations FOR SELECT TO authenticated
  USING (org_id = (current_setting('request.jwt.claims', true)::json -> 'app_metadata' ->> 'org_id')::uuid);

CREATE POLICY "cfo_conversations_insert" ON cfo_conversations FOR INSERT TO authenticated
  WITH CHECK (org_id = (current_setting('request.jwt.claims', true)::json -> 'app_metadata' ->> 'org_id')::uuid);

CREATE POLICY "cfo_conversations_update" ON cfo_conversations FOR UPDATE TO authenticated
  USING (org_id = (current_setting('request.jwt.claims', true)::json -> 'app_metadata' ->> 'org_id')::uuid);

CREATE POLICY "cfo_conversations_delete" ON cfo_conversations FOR DELETE TO authenticated
  USING (org_id = (current_setting('request.jwt.claims', true)::json -> 'app_metadata' ->> 'org_id')::uuid);

CREATE INDEX idx_cfo_conversations_org ON cfo_conversations (org_id, updated_at DESC);

CREATE TABLE cfo_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES cfo_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  tool_call JSONB,
  tool_result JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE cfo_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cfo_messages_select" ON cfo_messages FOR SELECT TO authenticated
  USING (conversation_id IN (
    SELECT id FROM cfo_conversations
    WHERE org_id = (current_setting('request.jwt.claims', true)::json -> 'app_metadata' ->> 'org_id')::uuid
  ));

CREATE POLICY "cfo_messages_insert" ON cfo_messages FOR INSERT TO authenticated
  WITH CHECK (conversation_id IN (
    SELECT id FROM cfo_conversations
    WHERE org_id = (current_setting('request.jwt.claims', true)::json -> 'app_metadata' ->> 'org_id')::uuid
  ));

CREATE POLICY "cfo_messages_delete" ON cfo_messages FOR DELETE TO authenticated
  USING (conversation_id IN (
    SELECT id FROM cfo_conversations
    WHERE org_id = (current_setting('request.jwt.claims', true)::json -> 'app_metadata' ->> 'org_id')::uuid
  ));

CREATE INDEX idx_cfo_messages_conversation ON cfo_messages (conversation_id, created_at);
