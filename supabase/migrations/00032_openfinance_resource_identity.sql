-- =============================================================================
-- Como o usuário distingue duas contas do mesmo banco — Migration 00032
-- =============================================================================
--
-- `GET /consents/{id}/resources` devolve apenas type, status e resource_id.
-- Quem tem dois cartões na mesma instituição vê duas linhas escritas "Cartão de
-- crédito", idênticas — e escolher errado joga o extrato de um cartão na conta
-- do outro, sem nada na tela que denuncie o engano.
--
-- A identificação é buscada no detalhe do recurso e guardada aqui, em vez de
-- consultada a cada tela: a rota de detalhe tem limite de 30 req/min POR
-- CREDENCIAL, e a credencial é uma para o floow inteiro. O que é orçamento
-- compartilhado não se gasta em renderização.

ALTER TABLE public.openfinance_resources
  -- Rótulo curto e sempre preenchido, ex.: "Cartão · Platinum · final 1234".
  -- O último elo da cadeia usa o fim do resource_id, então duas linhas nunca
  -- ficam iguais nem quando a instituição não manda metadado nenhum.
  ADD COLUMN IF NOT EXISTS display_label text,
  -- Só os QUATRO últimos dígitos. O número completo não é guardado: o rótulo
  -- vai para a tela e isto vai para o banco, e nenhum dos dois precisa do PAN.
  ADD COLUMN IF NOT EXISTS identification_digits text,
  -- De qual elo da cadeia veio: detail | transaction | fallback. Serve para
  -- medir qualidade — muitos 'fallback' significa que a extração precisa
  -- aprender campos novos.
  ADD COLUMN IF NOT EXISTS identification_source text,
  -- CHAVES vistas no payload do detalhe, sem valores. É assim que a forma real
  -- da resposta de cada instituição vira conhecimento sem ninguém precisar
  -- inspecionar a conta de um cliente.
  ADD COLUMN IF NOT EXISTS detail_keys text[];

COMMENT ON COLUMN public.openfinance_resources.identification_digits IS
  'Quatro últimos dígitos apenas. Número completo nunca é armazenado.';

COMMENT ON COLUMN public.openfinance_resources.detail_keys IS
  'Nomes de campo observados no detalhe do recurso, sem valores — diagnóstico da forma da resposta.';
