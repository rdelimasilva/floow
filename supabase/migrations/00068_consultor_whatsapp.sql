-- Consultor no WhatsApp (fase 3).
-- Spec: docs/superpowers/specs/2026-09-28-consultor-whatsapp-design.md
--
-- 1. Org padrão do WhatsApp: com várias orgs, o usuário escolhe em
--    Configurações qual delas o consultor usa. Vazio + uma org só = essa org.
-- 2. Canal da conversa: uma conversa 'whatsapp' por usuário/org, separada das
--    conversas da web.
-- 3. Id da mensagem da Meta (wamid) na pergunta gravada: a Meta reenvia a
--    mesma mensagem, e o índice único impede responder (e pagar o Claude) duas
--    vezes.

-- 1 ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS whatsapp_org_id uuid NULL
    REFERENCES public.orgs(id) ON DELETE SET NULL;

-- 2 ---------------------------------------------------------------------------
ALTER TABLE public.cfo_conversations
  ADD COLUMN IF NOT EXISTS canal text NOT NULL DEFAULT 'web';

ALTER TABLE public.cfo_conversations
  DROP CONSTRAINT IF EXISTS cfo_conversations_canal_check;
ALTER TABLE public.cfo_conversations
  ADD CONSTRAINT cfo_conversations_canal_check CHECK (canal IN ('web', 'whatsapp'));

CREATE INDEX IF NOT EXISTS idx_cfo_conversations_canal
  ON public.cfo_conversations (org_id, user_id, canal);

-- 3 ---------------------------------------------------------------------------
ALTER TABLE public.cfo_messages
  ADD COLUMN IF NOT EXISTS external_id text NULL;

CREATE UNIQUE INDEX IF NOT EXISTS cfo_messages_external_id_uq
  ON public.cfo_messages (external_id)
  WHERE external_id IS NOT NULL;
