-- =============================================================================
-- Contador de uso para trava de custo
-- -----------------------------------------------------------------------------
-- Contador em memoria nao serve em serverless: cada instancia teria o seu, e o
-- teto real viraria "limite x numero de instancias". O incremento acontece aqui,
-- num UPSERT atomico, entao requisicoes simultaneas nao furam o limite.
-- =============================================================================

CREATE TABLE public.rate_limits (
  bucket        text NOT NULL,
  subject       text NOT NULL,
  window_start  timestamptz NOT NULL,
  count         integer NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, subject, window_start)
);

-- Usado so pela limpeza periodica das janelas vencidas.
CREATE INDEX idx_rate_limits_window_start
  ON public.rate_limits USING btree (window_start);

-- RLS ligado e NENHUMA policy: isto e infraestrutura, nao dado do usuario.
-- Sem policy, o RLS nega tudo para authenticated/anon. So o backend escreve.
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.rate_limits IS
  'Contador de janela fixa para travas de uso. Sem policy de RLS: acesso apenas pelo backend.';
