-- =============================================================================
-- Perfil do investidor
-- -----------------------------------------------------------------------------
-- A aba Diagnóstico, em Investimentos, pergunta como a família se descreve ao
-- investir. A resposta decide se a regra de concentração por classe (R07)
-- roda: para quem é conservador, 80% em renda fixa não é problema.
--
-- Fica na org porque a org é a família. Nula até ser respondida. A policy
-- "orgs: owners can update" já cobre a escrita.
--
-- Para desfazer: ALTER TABLE public.orgs DROP COLUMN perfil_investidor;
-- =============================================================================

ALTER TABLE public.orgs ADD COLUMN perfil_investidor text
  CHECK (perfil_investidor IN ('conservador', 'moderado', 'arrojado'));
