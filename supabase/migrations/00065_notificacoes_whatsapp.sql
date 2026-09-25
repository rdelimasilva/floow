-- supabase/migrations/00065_notificacoes_whatsapp.sql
-- =============================================================================
-- Notificações de ritmo por WhatsApp, e preferência por org
-- -----------------------------------------------------------------------------
-- 1. Número de WhatsApp do usuário (um por pessoa, vale em todas as orgs).
-- 2. Código de verificação do número (só o backend lê/escreve).
-- 3. Preferência por org × usuário × canal, com frequência. Linha ausente =
--    padrão (e-mail 'alerts', WhatsApp 'weekly' se o número estiver verificado).
--    Substitui profiles.email_pacing_alerts, que era global por usuário.
-- 4. pacing_alert_state passa a ser por canal: se o e-mail sai e o WhatsApp
--    falha, só o WhatsApp reenvia no dia seguinte.
-- =============================================================================

-- 1 ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS whatsapp_phone text,
  ADD COLUMN IF NOT EXISTS whatsapp_verified_at timestamptz;

-- Um número verificado pertence a um usuário só. É por aqui que o webhook
-- descobre quem mandou a mensagem.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_whatsapp_phone_verified_uq
  ON public.profiles (whatsapp_phone)
  WHERE whatsapp_verified_at IS NOT NULL;

-- 2 ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_verifications (
  user_id     uuid PRIMARY KEY,
  phone       text NOT NULL,
  code_hash   text NOT NULL,
  expires_at  timestamptz NOT NULL,
  attempts    integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- RLS ligado e NENHUMA policy: só o backend acessa.
ALTER TABLE public.whatsapp_verifications ENABLE ROW LEVEL SECURITY;

-- 3 ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  org_id      uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL,
  channel     text NOT NULL CHECK (channel IN ('email', 'whatsapp')),
  frequency   text NOT NULL CHECK (frequency IN ('daily', 'weekly', 'alerts', 'off')),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, user_id, channel)
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notification_preferences: own select" ON public.notification_preferences;
CREATE POLICY "notification_preferences: own select"
  ON public.notification_preferences FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "notification_preferences: own insert" ON public.notification_preferences;
CREATE POLICY "notification_preferences: own insert"
  ON public.notification_preferences FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND org_id IN (SELECT public.get_user_org_ids())
  );

DROP POLICY IF EXISTS "notification_preferences: own update" ON public.notification_preferences;
CREATE POLICY "notification_preferences: own update"
  ON public.notification_preferences FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND org_id IN (SELECT public.get_user_org_ids())
  );

GRANT SELECT, INSERT, UPDATE ON public.notification_preferences TO authenticated;

-- Quem tinha o e-mail de ritmo desligado continua desligado, em cada org.
INSERT INTO public.notification_preferences (org_id, user_id, channel, frequency)
SELECT m.org_id, m.user_id, 'email', 'off'
FROM public.org_members m
JOIN public.profiles p ON p.id = m.user_id
WHERE p.email_pacing_alerts = false
ON CONFLICT DO NOTHING;

COMMENT ON COLUMN public.profiles.email_pacing_alerts IS
  'OBSOLETA desde 00065: a preferência vive em notification_preferences. Remover numa migration futura.';

-- 4 ---------------------------------------------------------------------------
ALTER TABLE public.pacing_alert_state
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'email'
    CHECK (channel IN ('email', 'whatsapp'));

ALTER TABLE public.pacing_alert_state DROP CONSTRAINT IF EXISTS pacing_alert_state_pkey;
ALTER TABLE public.pacing_alert_state
  ADD CONSTRAINT pacing_alert_state_pkey PRIMARY KEY (org_id, month, category_id, channel);
