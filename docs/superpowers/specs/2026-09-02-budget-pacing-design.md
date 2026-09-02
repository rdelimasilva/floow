# Pacing de orçamento: orçado × realizado diário

**Data:** 2026-09-02
**Status:** proposto
**Subsistema:** 2 de 4 (ver "Contexto maior")

## Objetivo

Cruzar o orçado por categoria com o efetivamente gasto, **dia a dia**, separando o que
passou por cartão de crédito do que saiu da conta corrente, e projetar o fechamento do
mês para que o usuário corrija a rota antes do estouro — não depois.

## Contexto maior

Este documento cobre **apenas o subsistema 2**. O produto completo tem quatro, nesta
ordem de construção definida pelo usuário:

| # | Subsistema | Estado |
|---|---|---|
| 1 | Ingestão Open Finance (Polp sobre Celcoin) | posterior |
| **2** | **Pacing orçado × realizado** | **este documento** |
| 3 | Canal WhatsApp | posterior |
| 4 | Política de notificação diária | posterior |

O subsistema 2 não depende de nenhum dos outros. Ele roda sobre os dados que já existem
hoje (import CSV/OFX + lançamento manual) e, quando a ingestão do subsistema 1 chegar,
apenas passa a receber dados mais frescos — sem alteração no cálculo.

## Escopo

**Dentro:**
- Série diária acumulada de gasto no mês, segmentada por tipo de conta
- Projeção de fechamento do mês pelo ritmo corrente
- Status por categoria (ok / atenção / risco / estourado)
- Tela nova em `/budgets/pacing`
- Insight de pacing no motor CFO que já roda diariamente

**Fora:**
- Qualquer alteração de schema (nenhuma migration)
- Conceito de fatura, data de vencimento ou fluxo de caixa projetado
- Meta por conta ou por cartão (o teto continua sendo por categoria)
- Envio de notificação por qualquer canal
- Alterações em `/budgets/spending` além do alinhamento descrito em "Dívida corrigida"

## Decisões

### D1 — Regime de competência (data da compra)

Uma compra no cartão em 03/09 conta como gasto em 03/09, não no vencimento da fatura.

**Por quê:** é o que o floow já faz, mantém o vínculo direto entre gasto e categoria no
dia, e dispensa qualquer conceito de fatura. Como o pagamento da fatura é registrado
como `transfer` e a agregação filtra `type = 'expense'`, não há dupla contagem.

**Consequência aceita:** o gráfico não representa saída de caixa. O dinheiro de uma
compra no cartão ainda está na conta do usuário no dia em que o gráfico o mostra gasto.

### D2 — Referência diária por ritmo, sem curva distribuída

Não se distribui o teto mensal ao longo dos dias. Mostra-se o acumulado real contra o
teto do mês e projeta-se o fechamento pelo ritmo corrente.

**Por quê:** qualquer distribuição (linear ou histórica) inventa uma premissa que o
usuário não declarou. A linear dispara alarme falso com gasto concentrado (aluguel no
dia 5). A histórica exige histórico, é opaca e ancora no comportamento que o usuário
talvez queira mudar. O ritmo não pressupõe nada e funciona no primeiro mês de uso.

### D3 — Cartão × conta corrente é leitura, não meta

O teto continua sendo definido por categoria. O tipo de conta entra apenas como
segmentação da série exibida.

**Por quê:** responde "quanto do meu gasto passa pelo cartão" sem exigir schema novo nem
uma segunda tela de configuração. Meta por instrumento fica registrada como possível
evolução, não como escopo.

### D4 — Total no topo, categorias como detalhe

A visão principal é o total do mês. Abaixo, a lista de categorias ordenada por risco,
cada uma com seu teto, realizado e projeção.

**Por quê:** o total responde "estou bem?" e a lista responde "onde?" — sem exigir clique
para chegar ao diagnóstico.

### D5 — Gasto não orçado aparece como faixa separada

A comparação teto × realizado usa **somente as categorias que têm teto**. O gasto de
categorias sem teto (e de transações sem categoria) aparece como faixa distinta, fora do
denominador.

**Por quê:** hoje `/budgets/spending` compara o teto (só categorias orçadas) contra o
gasto (todas as despesas) — universos diferentes, percentual inflado. Ignorar o gasto não
orçado esconderia dinheiro real saindo. A faixa separada mantém o percentual honesto e
torna a lacuna visível, convidando o usuário a orçar a categoria.

### D6 — SQL agrega, `@floow/core-finance` calcula

A query devolve linhas agregadas por dia × tipo de conta × categoria. Todo o cálculo de
acumulado, projeção e status vive numa função pura, sem I/O, em `@floow/core-finance`.

**Por quê:** a regra de projeção é a parte que será ajustada com o uso, e precisa estar
coberta por teste sem depender de banco. Segue o padrão já estabelecido em
`cash-flow.ts` e `cfo/analyzers/`. Alternativa descartada: window functions em SQL —
joga a regra para fora do alcance de teste unitário sem ganho relevante nesta escala
(cerca de 900 linhas no pior caso de um mês).

## Regras de cálculo

### Convenção de sinal

Despesas são persistidas com valor **negativo** (`actions.ts:301`:
`type === 'income' ? amountCents : -amountCents`). A agregação usa `SUM(-amount_cents)`
filtrando `type = 'expense'` e `is_ignored = false`.

Usa-se `-amount_cents` em vez de `ABS(amount_cents)` porque, sob a convenção do projeto,
os dois são idênticos para todo dado existente (o schema Zod valida entrada positiva, e a
action inverte o sinal), mas `-amount_cents` abate corretamente um estorno que venha
importado como `expense` positivo. É correção de graça, sem mudança de comportamento hoje.

### Projeção

```
projetado = acumulado_até_hoje ÷ dias_decorridos × dias_do_mês
```

`dias_decorridos` inclui o dia corrente. O mês analisado é sempre o de `monthStart`; a
posição de `today` em relação a ele define três casos:

| Caso | `daysElapsed` | Projeção |
|---|---|---|
| Mês corrente | dia de `today` | pela fórmula acima |
| Mês passado (`today` após o fim) | `daysInMonth` | `projetado = realizado` |
| Mês futuro (`today` antes do início) | `0` | `0`, e nenhuma categoria recebe status de alerta |

O mês futuro é alcançável pela navegação da tela e nunca deve produzir `daysElapsed`
negativo nem divisão por zero.

A projeção carrega um campo `confidence`:
- `low` antes do dia 7 do mês — extrapolar 3 dias para 30 é ruído, e a interface deve
  dizer isso em vez de fingir precisão
- `normal` do dia 7 em diante
- `final` quando o mês já encerrou

### Status por categoria

Avaliado nesta ordem, o primeiro que casar vence:

| Status | Condição |
|---|---|
| `estourado` | `spentCents > plannedCents` |
| `risco` | `projectedCents > plannedCents * 1.10` |
| `atencao` | `projectedCents > plannedCents` e `<= plannedCents * 1.10` |
| `ok` | `projectedCents <= plannedCents` |

Teto zero é tratado como categoria sem teto (entra em "não orçado"), nunca como divisão
por zero.

Categoria sem teto não recebe status — entra na faixa "não orçado".

Os limiares de 100% e 110% e o corte de `confidence` no dia 7 são os pontos sintonizáveis
do design. Ficam como constantes nomeadas no topo do módulo, não espalhadas pelo código.

## Arquitetura

```
transactions ─┐
              ├─> [2.2] getDailySpending()  ──> linhas agregadas
accounts   ───┘         SQL: GROUP BY date, accounts.type, category_id
                                    │
budget_entries ──> getBudgetEntriesForMonth()  (já existe)
                                    │
                                    v
              [2.1] computeBudgetPacing()   função pura, testável, sem I/O
                                    │
                    ┌───────────────┴───────────────┐
                    v                               v
        [2.3] /budgets/pacing            [2.4] cfo/analyzers/budget.ts
              (Recharts)                       -> cfo_insights.metric
```

### Módulos

| Arquivo | Responsabilidade |
|---|---|
| `packages/core-finance/src/budget-pacing.ts` | Cálculo puro. Sem I/O, sem React. |
| `apps/web/lib/finance/budget-daily-queries.ts` | Query agregada + cache |
| `apps/web/components/finance/budget-pacing-chart.tsx` | Gráfico Recharts |
| `apps/web/app/(app)/budgets/pacing/` | Página (server) + client component |
| `packages/core-finance/src/cfo/analyzers/budget.ts` | Estendido para emitir insight de pacing |

Todos abaixo de 500 linhas, conforme `CLAUDE.md`. A separação em `budget-daily-queries.ts`
em vez de crescer `budget-queries.ts` (já com 287 linhas) protege esse limite.

### Contrato da função pura

```ts
// packages/core-finance/src/budget-pacing.ts

export type AccountKind = 'checking' | 'savings' | 'brokerage' | 'credit_card' | 'cash'
export type PacingStatus = 'ok' | 'atencao' | 'risco' | 'estourado'
export type Confidence = 'low' | 'normal' | 'final'

export interface DailySpendRow {
  date: string            // YYYY-MM-DD
  accountType: AccountKind
  categoryId: string | null
  cents: number           // positivo, já normalizado pela query
}

export interface BudgetCap {
  categoryId: string
  plannedCents: number
}

export interface BudgetPacingInput {
  daily: DailySpendRow[]
  budgets: BudgetCap[]
  monthStart: Date
  today: Date
}

export interface BudgetPacingResult {
  series: {
    date: string
    // Todos os campos abaixo são ACUMULADOS desde o dia 1 do mês.
    // A tela desenha curva acumulada; o gasto de um dia isolado, se
    // vier a ser necessário, deriva-se pela diferença com o dia anterior.
    byAccountTypeCum: Record<AccountKind, number>
    budgetedCum: number
    unbudgetedCum: number
  }[]
  total: {
    plannedCents: number
    spentCents: number          // apenas categorias com teto
    unbudgetedCents: number     // categorias sem teto + sem categoria
    projectedCents: number
    confidence: Confidence
    daysElapsed: number
    daysInMonth: number
  }
  byCategory: {
    categoryId: string
    plannedCents: number
    spentCents: number
    projectedCents: number
    status: PacingStatus
  }[]
}

export function computeBudgetPacing(input: BudgetPacingInput): BudgetPacingResult
```

`byCategory` sai no formato que o campo `metric` (JSONB) de `cfo_insights` já aceita — é
o que torna a fatia 2.4 barata e deixa o conteúdo pronto para o subsistema 4 consumir.

## Fatias

Cada fatia é entregável e verificável sozinha, na ordem.

### 2.1 — Núcleo de cálculo

`packages/core-finance/src/budget-pacing.ts` + testes. TDD: o teste vem primeiro.

Casos obrigatórios:
- Mês em andamento com dias decorridos menores que 7, resultando em `confidence: 'low'`
- Mês encerrado, com `projectedCents === spentCents` e `confidence: 'final'`
- Dia 1 do mês, com projeção definida (divisor 1, nunca 0)
- Categoria com gasto e sem teto: entra em `unbudgetedCents`, ausente de `byCategory`
- Transação com `categoryId: null`: entra em `unbudgetedCents`
- Categoria com teto e sem gasto: aparece em `byCategory` com status `ok`
- Realizado acima do teto: `estourado`, mesmo com projeção abaixo
- Fronteiras exatas de status: projeção em 100% do teto (`ok`) e em 110% (`atencao`)
- Teto zero: tratado como categoria sem teto, sem divisão por zero
- Mês futuro: `daysElapsed === 0`, projeção zero, nenhum status de alerta,
  `confidence: 'low'`
- Meses de 28, 30 e 31 dias
- Dia sem nenhuma transação: presente na série, com zeros
- Entrada vazia: resultado com zeros, sem lançar exceção

Sem banco, sem rede, sem React. Verificação: `pnpm test` no pacote.

### 2.2 — Query agregada

`apps/web/lib/finance/budget-daily-queries.ts`, expondo
`getDailySpending(orgId, start, end)`.

- `GROUP BY date, accounts.type, category_id` com `INNER JOIN accounts`
- Filtros: `org_id`, `type = 'expense'`, `is_ignored = false`, intervalo de datas
- `unstable_cache` reusando a tag `budgetSpendingTag(orgId)` que já existe, para que a
  invalidação após criar ou editar transação continue funcionando sem código novo
- Função irmã de `getSpendingByCategory`, **não** substituta — `/budgets/spending` segue
  intacta

### 2.3 — Tela

`/budgets/pacing`, irmã de `spending` e `investing`. Server component busca, função pura
calcula, client component desenha.

- Recharts 2.15.4 (já no projeto), seguindo o padrão de `cash-flow-chart.tsx` e o wrapper
  `components/ui/chart.tsx`
- Área empilhada por tipo de conta, linha de teto, projeção tracejada, faixa "não orçado"
  visualmente distinta do gasto orçado
- Lista de categorias ordenada por status (`estourado`, `risco`, `atencao`, `ok`)
- Quando `confidence === 'low'`, a projeção é exibida com ressalva explícita
- Navegação de mês por query string, como já fazem `spending` e `investing`
- A skill `dataviz` deve ser carregada antes de escrever a primeira linha de código de
  gráfico

Mantém `/budgets/spending` como tela de edição de orçamento. Análise e edição em telas
separadas, cada uma fazendo uma coisa.

### 2.4 — Ponte para o motor CFO

`packages/core-finance/src/cfo/analyzers/budget.ts` passa a chamar
`computeBudgetPacing` e emitir insight quando uma categoria estiver em `risco` ou
`estourado`.

O cron diário já existe e já roda (`/api/cfo/run-daily`). Esta fatia faz ele começar a
acumular exatamente o conteúdo que o subsistema 4 vai enviar por WhatsApp — sem construir
nada de WhatsApp agora.

## Dívida corrigida no caminho

`getSpendingByCategory` usa `SUM(ABS(amount_cents))`. Alinhar para `SUM(-amount_cents)`,
igual à query nova. Para todo dado existente o resultado é idêntico (despesa é sempre
negativa); a mudança apenas evita que as duas telas divirjam quando um estorno for
importado como `expense` positivo pelo subsistema 1.

`spending/client.tsx:85` compara `totalPlanned` (só categorias orçadas) com `totalSpent`
(todas as despesas). Fica **registrado, não corrigido aqui** — corrigi-lo altera o número
exibido numa tela em uso, e merece decisão própria. A tela nova nasce com a comparação
correta por D5.

## Riscos

| Risco | Mitigação |
|---|---|
| Projeção ruidosa no início do mês gera alarme falso | `confidence: 'low'` até o dia 7, exibido na interface |
| Fuso horário desloca transação entre dias | `transactions.date` é `date` (sem hora); comparar sempre como string `YYYY-MM-DD`, nunca via `Date` local |
| Categorização errada torna o relatório por categoria inútil | Fora do escopo desta fase; é o motivo de `payeeMCC` ter sido registrado para o subsistema 1 |
| Série diária pesada em orgs grandes | Cerca de 900 linhas por mês no pior caso; `unstable_cache` com `revalidate: 300` como nos demais |

## Registrado para fases futuras

Decisões baratas agora, caras depois — anotadas aqui para não se perderem:

- **Subsistema 1:** persistir `billPostDate` na ingestão. O padrão Open Finance entrega
  `transactionDateTime` (competência) e `billId`/`billPostDate` (caixa) no mesmo payload.
  Guardar o segundo custa uma coluna e destrava a visão de caixa sem re-integrar.
- **Subsistema 1:** `payeeMCC` como categorizador primário, com `category_rules` mantida
  como override do usuário.
- **Subsistema 1:** filtrar `transactionType` — `PAGAMENTO` de fatura não é despesa (dupla
  contagem com a transferência da conta corrente) e `ESTORNO` abate.
- **Subsistema 1:** consentimento expira em no máximo 12 meses e não renova sozinho;
  monitorar estado e avisar antes de expirar, ou o job diário emudece em silêncio.
- **Subsistema 1:** desenhar atrás de uma interface `OpenFinanceProvider`; a doc da Polp
  ainda não está acessível e não se sabe se é passthrough do padrão ou modelo próprio.
- **Antes do subsistema 3:** existem **dois agendadores para a mesma rota** —
  `vercel.json` (`0 10 * * *`) e `netlify/functions/cfo-daily.mts` (`0 7 * * *`). Hoje é
  desperdício; com WhatsApp no fim do cano, vira duas mensagens por dia para o usuário.
- **Subsistema 4:** notificação diária por calendário tende ao mute. O motor já trabalha
  com `severity` e `expires_at`, o que sugere disparar por mudança de status, com um
  resumo periódico fixo como piso.
