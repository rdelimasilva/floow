-- =============================================================================
-- Categorias de sistema deixam de ser globalmente editáveis — Migration 00029
-- =============================================================================
--
-- As categorias de sistema (org_id IS NULL) são compartilhadas por todas as
-- orgs, mas a interface deixava qualquer usuário renomeá-las e excluí-las com
-- um UPDATE/DELETE por id, sem filtro de org. Uma pessoa renomeando
-- "Transporte" renomeava para todo mundo.
--
-- Isso não é hipótese: neste banco "Transporte" virou "Carro" e "Saúde",
-- "Outros" e "Assinaturas" desapareceram para as três orgs de uma vez. Foi o
-- que fez a 00028 abortar.
--
-- A partir daqui, editar uma categoria de sistema cria uma cópia da própria org
-- (copy-on-write, em category-actions.ts) e esconde a original para ela. Esta
-- tabela é o "esconde para ela": o registro de que uma org não quer mais ver
-- determinada categoria de sistema.
--
-- Por que esconder em vez de excluir: a linha de sistema é de todas as orgs.
-- Apagá-la para atender uma delas é exatamente o defeito que estamos
-- consertando.

CREATE TABLE IF NOT EXISTS public.hidden_system_categories (
  org_id      uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, category_id)
);

COMMENT ON TABLE public.hidden_system_categories IS
  'Categorias de sistema que uma org escolheu não ver. A linha original continua existindo para as demais orgs.';

-- ----------------------------------------------------------------------------
-- RLS no padrão do projeto
-- ----------------------------------------------------------------------------

ALTER TABLE public.hidden_system_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hidden_system_categories: members can select"
  ON public.hidden_system_categories FOR SELECT
  USING (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "hidden_system_categories: members can insert"
  ON public.hidden_system_categories FOR INSERT
  WITH CHECK (org_id IN (SELECT public.get_user_org_ids()));

-- Reexibir é desfazer a própria escolha, então DELETE também é da org.
CREATE POLICY "hidden_system_categories: members can delete"
  ON public.hidden_system_categories FOR DELETE
  USING (org_id IN (SELECT public.get_user_org_ids()));
