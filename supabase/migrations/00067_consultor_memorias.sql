-- Memória do consultor: o que ele aprende sobre cada usuário, por org.
--
-- Objetivos, preferências, restrições e contexto de vida que o usuário conta
-- na conversa. O consultor grava sozinho e avisa ("Anotei: …"); o usuário vê e
-- apaga pela lista no /cfo. Sem UPDATE: corrigir é apagar e gravar de novo.
-- Spec: docs/superpowers/specs/2026-09-28-consultor-memoria-design.md

CREATE TABLE IF NOT EXISTS public.consultor_memorias (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL,
  conteudo    text NOT NULL CHECK (char_length(conteudo) BETWEEN 1 AND 300),
  canal       text NOT NULL CHECK (canal IN ('web', 'whatsapp')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consultor_memorias_usuario
  ON public.consultor_memorias (org_id, user_id, created_at);

ALTER TABLE public.consultor_memorias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "consultor_memorias: own select" ON public.consultor_memorias;
CREATE POLICY "consultor_memorias: own select"
  ON public.consultor_memorias FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND org_id IN (SELECT public.get_user_org_ids())
  );

DROP POLICY IF EXISTS "consultor_memorias: own insert" ON public.consultor_memorias;
CREATE POLICY "consultor_memorias: own insert"
  ON public.consultor_memorias FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND org_id IN (SELECT public.get_user_org_ids())
  );

DROP POLICY IF EXISTS "consultor_memorias: own delete" ON public.consultor_memorias;
CREATE POLICY "consultor_memorias: own delete"
  ON public.consultor_memorias FOR DELETE TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND org_id IN (SELECT public.get_user_org_ids())
  );

GRANT SELECT, INSERT, DELETE ON public.consultor_memorias TO authenticated;
