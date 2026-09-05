-- =============================================================================
-- Derruba transaction_nature_rules, substituída por counterparties (00035).
-- Adiada da 00035 de propósito: sync.ts e nature-actions.ts/nature-rules.ts
-- só pararam de consultar esta tabela agora, nesta mesma task que os apaga —
-- derrubar antes teria quebrado o app no meio do plano.
-- =============================================================================

DROP TABLE public.transaction_nature_rules;
