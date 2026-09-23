-- =============================================================================
-- Alerta de ritmo de gasto por e-mail
-- -----------------------------------------------------------------------------
-- 1. Preferência por usuário (ligada por padrão; o link do rodapé desliga).
-- 2. Memória do último status enviado por categoria no mês, para só mandar
--    e-mail quando o status piora (risco -> estourado), e não todo dia.
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN email_pacing_alerts boolean NOT NULL DEFAULT true;

CREATE TABLE public.pacing_alert_state (
  org_id       uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  month        text NOT NULL,           -- YYYY-MM
  category_id  uuid NOT NULL,
  status       text NOT NULL,           -- 'risco' | 'estourado'
  sent_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, month, category_id)
);

-- RLS ligado e NENHUMA policy: infraestrutura do cron, não dado exibido ao
-- usuário. Só o backend lê e escreve.
ALTER TABLE public.pacing_alert_state ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.pacing_alert_state IS
  'Último status de ritmo enviado por e-mail, por categoria e mês. Sem policy de RLS: acesso apenas pelo backend.';
