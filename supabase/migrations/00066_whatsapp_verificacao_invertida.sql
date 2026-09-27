-- supabase/migrations/00066_whatsapp_verificacao_invertida.sql
-- =============================================================================
-- Verificação invertida do WhatsApp
-- -----------------------------------------------------------------------------
-- Antes: a pessoa digitava o número e recebia um código pelo template
-- floow_codigo. A Meta não libera template de autenticação sem a empresa
-- verificada, então ninguém conseguia confirmar o número.
--
-- Agora: o app mostra um código e a pessoa o envia do próprio WhatsApp. O
-- webhook acha o código e liga à conta o número que mandou a mensagem (o
-- `from`, autenticado pela assinatura da Meta). Por isso:
--
-- 1. `phone` passa a aceitar NULL: o número só é conhecido quando a
--    mensagem chega, e aí vai direto para profiles.
-- 2. Pendências do fluxo antigo são apagadas: o hash delas amarrava
--    usuário + número e não serve no fluxo novo. Vem antes do índice para
--    que nada antigo atrapalhe a criação dele.
-- 3. `code_hash` único: o webhook procura o código sem saber de quem é
--    (o hash não inclui o usuário), e dois pendentes com o mesmo hash
--    tornariam o dono ambíguo.
--
-- `attempts` fica OBSOLETA: o limite agora é por remetente, em rate_limits.
-- Remover numa migration futura.
--
-- Idempotente: pode rodar de novo sem erro.
-- =============================================================================

-- 1 ---------------------------------------------------------------------------
ALTER TABLE public.whatsapp_verifications
  ALTER COLUMN phone DROP NOT NULL;

-- 2 ---------------------------------------------------------------------------
DELETE FROM public.whatsapp_verifications;

-- 3 ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_verifications_code_hash_uq
  ON public.whatsapp_verifications (code_hash);

COMMENT ON COLUMN public.whatsapp_verifications.attempts IS
  'OBSOLETA desde 00066: o limite de tentativas é por remetente, em rate_limits. Remover numa migration futura.';
