# Investimentos via Open Finance — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Importar da Polp a carteira de investimentos (cinco tipos) com posição do banco, movimentações, proventos e rentabilidade, dentro da tela de investimentos existente.

**Architecture:** Normalizadores puros em `core-finance` convertem o payload de cada tipo em `{ asset, position, events }`. A ingestão em `apps/web/lib/openfinance/investimentos/` lista investimentos por consentimento (a listagem já traz `balance`), grava identidade em `assets`, posição diária em `asset_bank_positions` e movimentações em `portfolio_events`, e recalcula `asset_position_snapshots` — que para ativo do banco usa a posição do banco, não os eventos.

**Tech Stack:** Next.js (App Router, server actions), Drizzle ORM 0.40, Postgres (Supabase migrations em SQL), Vitest, pnpm/turbo.

**Spec:** `docs/superpowers/specs/2026-09-23-openfinance-investimentos-design.md`

O plano está dividido em oito arquivos (limite de 500 linhas do projeto). Execute na ordem:

| Parte | Arquivo | Tarefas |
|---|---|---|
| 1 | `2026-09-23-openfinance-investimentos-1-dados.md` | T1 migração + schema |
| 2 | `2026-09-23-openfinance-investimentos-2-carteira.md` | T2 carteira com eventos novos e posição do banco · T3 rótulos e classes |
| 3 | `2026-09-23-openfinance-investimentos-3-polp.md` | T4 tipos e rotas no cliente · T5 conversões |
| 4 | `2026-09-23-openfinance-investimentos-4-normalizar-investimento.md` | T6 investimento e posição |
| 5 | `2026-09-23-openfinance-investimentos-5-normalizar-movimentacao.md` | T7 movimentações |
| 6 | `2026-09-23-openfinance-investimentos-6-repositorio.md` | T8 repositório |
| 7 | `2026-09-23-openfinance-investimentos-7-ingestao.md` | T9 orquestração · T10 cron, botão e filtros |
| 8 | `2026-09-23-openfinance-investimentos-8-consentimento-tela.md` | T11 produto no wizard · T12 tela |

**Fora deste plano:** a ação "Incluir investimentos" em conexão antiga depende da pendência P1 (ver fim da Parte 8). Até ela existir, investimento chega só por conexão nova.

## Global Constraints

- Nenhum arquivo passa de 500 linhas (CLAUDE.md). `connection-actions.ts` já tem 494 — código novo de conexão vai em arquivo novo.
- Textos de UI em pt-BR ("tela", "você").
- Movimentação de investimento **nunca** cria linha em `transactions` (D3).
- A rota de detalhe da Polp (`GET /<tipo>/{id}`) **não é chamada** — limite de 30 req/min.
- `org_id` nunca vem do dado remoto: vem da conexão.
- Arquivo novo em `apps/web` que chama `getDb()` quebra `__tests__/auth/rls-ledger.test.ts`. A ingestão recebe `db` por parâmetro (como `sync.ts`); só `importacao-agendada.ts` (já listado como serviço) cria o `db`.
- Próxima migration livre hoje: `00053`. Confirme com `ls supabase/migrations | tail -1` antes de criar e use o número seguinte.
- Commits: sem `git add -A` (há sessões concorrentes no diretório). Confira `git branch --show-current` = `feat/openfinance-investimentos` antes de cada commit.

## Ajustes em relação à spec (decididos no plano)

1. **`price_cents` fica.** A spec dizia trocar por `unit_price`. Ele segue em centavos (é o que 7 arquivos de UI leem) e ganha a coluna irmã `unit_price numeric` com o preço cheio do banco. `computePosition` não usa preço unitário, só `total_cents`, então nada se perde no cálculo.
2. **Dinheiro em `asset_bank_positions` é centavo inteiro** (`gross_cents`, `net_cents`, …), como o resto do sistema. Só `quantity`, `unit_price` e `purchase_unit_price` são `numeric`.
3. **`numeric` como número em TS.** Drizzle 0.40 devolve `numeric` como string. O plano cria o tipo `numericNumber` (customType) para `quantity` não virar string em 12 arquivos.
4. **`asset_position_snapshots.cost_is_partial`** (boolean) guarda o selo "custo parcial".
5. **`openfinance_connections.investment_account_id`** guarda a conta `brokerage` que recebe os eventos da conexão.
6. **Somente leitura só na tela.** `lib/investments/actions.ts` (555 linhas) não é tocado; edição por fora se autocorrige na próxima sincronização (ver T12).

Atualize a spec com esses pontos no commit da T1.

## Review Focus

1. **Recálculo manual apaga a verdade do banco.** `recomputeOrgPositionSnapshots` roda em toda ação manual e recalcula todos os ativos da org pelos eventos. Ativo `openfinance` tem de continuar usando a posição do banco — teste na T2.
2. **Mesmo investimento de outra org.** `polp_resource_id` é único global; se o investimento já pertence a outra org, a ingestão pula e registra issue, nunca atualiza a linha alheia — teste na T9.
3. **Segunda sincronização no mesmo dia.** Posição e evento são upsert; rodar duas vezes não duplica nada nem altera contagem — teste na T9.
4. **Investimento resgatado por inteiro.** Some da listagem da Polp ou vem com quantidade zero; a posição fica zerada e o ativo continua com histórico, não é apagado — teste na T2 (`quantity 0` → snapshot com valor 0) e T9 (ativo ausente não é tocado).
5. **Recursos de investimento no sync de transações.** `syncConnectionTransactions` itera todos os `openfinance_resources` da conexão e conta os sem conta como `skippedUnlinked`; recurso de investimento (com `asset_id`, sem `account_id`) não pode inflar esse número nem ser tratado como conta — teste na T10.
