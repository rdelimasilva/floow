# Sugestão de categorias a partir dos gastos de 12 meses

**Data:** 2026-09-24
**Status:** proposto

## Objetivo

Olhar os gastos dos últimos 12 meses e sugerir categorias novas, para que o gasto relevante
fique visível e possa ganhar meta própria. Duas situações disparam sugestão:

- **Tipo A — gasto mal classificado:** um mesmo estabelecimento aparece muito em
  "Sem categoria" ou numa categoria genérica ("Outros", "Outros serviços gerais"...).
  Sugere uma categoria nova para ele.
- **Tipo B — gasto relevante sem meta:** uma categoria pesa no total, não tem meta e é
  composta por grupos distintos. Sugere subcategorias para acompanhar separado.

## Escopo

**Dentro:**
- Motor determinístico (sem LLM) em `packages/core-finance`
- Tabela `category_suggestions` com status por sugestão
- Rota agendada semanal + botão "Analisar meus gastos" na tela de metas
- Card de sugestões dentro de `/budgets/spending` (sem item novo no menu)
- Aceitar: cria categoria, cria regra, recategoriza os 12 meses, abre diálogo de meta

**Fora:**
- LLM para agrupar estabelecimentos diferentes ("iFood" + "Rappi" → "Delivery").
  Entra depois, só se as sugestões ficarem fragmentadas demais.
- Notificação por e-mail/WhatsApp das sugestões
- Sugestão de categorias de receita

## Motor (`packages/core-finance/src/category-suggestions.ts`)

Função pura, sem acesso a banco:

```ts
suggestCategories(input: {
  transactions: { id, description, amountCents, date, categoryId | null }[]  // só despesas
  categories:   { id, name, parentId | null, isGeneric: boolean }[]
  categoriesWithGoal: Set<string>
  dismissedFingerprints: Set<string>
  today: Date
}): CategorySuggestion[]
```

### Normalização da descrição

`normalizeMerchant(description)`: minúsculas, sem acento, remove prefixos de adquirente
(`pag*`, `pg *`, `mp *`, `ifd*`, `ec *`...), dígitos, datas, sufixo de cidade/UF e
espaços repetidos. Fica com os dois primeiros tokens significativos. Resultado vazio →
lançamento ignorado. Esse termo normalizado é também o `match_value` da regra.

### Tipo A

Para cada grupo (termo normalizado) cujos lançamentos estão em categoria genérica ou sem
categoria:
- dispara se **≥ 6 lançamentos em ≥ 3 meses distintos**, **ou** total **≥ R$ 300**
- nome sugerido: o termo em Title Case ("Ifood" → editável no aceite)
- categoria mãe sugerida: nenhuma (raiz); o usuário pode escolher no aceite

### Tipo B

Para cada categoria **sem meta**, não genérica, com **≥ 10% do gasto total** dos 12 meses:
- agrupa seus lançamentos por termo normalizado
- grupos que batem o critério do tipo A viram sugestões de subcategoria (mãe = essa categoria)
- só sugere se houver **≥ 2 grupos** qualificados (um único grupo não justifica dividir)

### Regras comuns

- Categoria genérica = sem categoria, raiz "Outros" (`OTHER`) e filhas cujo nome começa
  com "Outros". Calculado na camada de consulta e passado como `isGeneric`.
- Não sugere nome que já exista como categoria da org (comparação normalizada).
- `fingerprint = kind + ':' + (parentId ?? 'root') + ':' + termo`. Fingerprint recusado
  nunca volta.
- Resultado ordenado por total desc, no máximo 10 sugestões por execução.
- Os limites (6, 3, R$ 300, 10%, 10) ficam numa constante exportada, para ajuste.

## Dados

Migration `00058_category_suggestions.sql`:

```sql
CREATE TABLE public.category_suggestions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  kind                text NOT NULL CHECK (kind IN ('uncategorized', 'split')),
  fingerprint         text NOT NULL,
  suggested_name      text NOT NULL,
  parent_category_id  uuid REFERENCES public.categories(id) ON DELETE CASCADE,
  source_category_ids uuid[] NOT NULL DEFAULT '{}',  -- de onde os lançamentos saem; vazio = sem categoria
  match_value         text NOT NULL,
  tx_count            integer NOT NULL,
  total_cents         bigint NOT NULL,
  monthly_avg_cents   bigint NOT NULL,
  status              text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','dismissed')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, fingerprint)
);
```

RLS igual às demais tabelas da org (via `org_ids` das claims). Schema Drizzle em
`packages/db`.

Consulta de entrada (`apps/web/lib/finance/category-suggestion-queries.ts`): mesmos filtros
de `getSpendingByCategory` — `type = 'expense'`, `review_state = 'confirmed'`,
`is_ignored = false` — janela de 12 meses até hoje (fuso de São Paulo).

## Execução (`runCategorySuggestionsForOrg(orgId)`)

1. Carrega entrada, roda o motor.
2. Upsert por `(org_id, fingerprint)`:
   - novo → insere `pending`
   - já `pending` → atualiza números (quantidade, total, média)
   - `accepted` / `dismissed` → não toca
3. Sugestões `pending` que deixaram de sair do motor são apagadas (o dado mudou).

**Disparos:**
- `apps/web/app/api/category-suggestions/run-weekly/route.ts`: `GET` e `POST`, autenticada
  por `CRON_SECRET` como `cfo/run-daily`; roda para orgs com lançamento nos últimos 30 dias,
  em lotes de 10, erro de uma org não derruba as outras. `vercel.json`:
  `"schedule": "0 10 * * 1"` (segunda, 7h em São Paulo).
- Botão "Analisar meus gastos" no card: server action que chama a mesma função para a org
  atual (`getOrgId()`) e revalida a tela.

## Tela

Card "Sugestões de categoria" em `/budgets/spending`, acima da lista de metas, só quando
houver sugestão `pending`. Cada linha: nome sugerido, "38 lançamentos · R$ 1.240 em 12
meses · ~R$ 103/mês", mãe (tipo B) e botões **Aceitar** / **Recusar**. Botão "Analisar meus
gastos" no cabeçalho do card (visível também sem sugestões, com estado vazio).

**Aceitar** abre um diálogo curto: nome (editável) e categoria mãe (editável). Confirmar
chama `acceptCategorySuggestion`, que em uma transação:
1. cria a categoria (`expense`, cor/ícone herdados da mãe ou padrão)
2. cria `category_rules` com `match_type = 'contains'`, `match_value` da sugestão
3. move para a nova categoria os lançamentos de 12 meses cujo termo normalizado casa **e**
   cuja categoria atual está em `source_category_ids` (ou é nula, no tipo A). Lançamentos
   classificados à mão em outra categoria não são tocados.
4. marca a sugestão `accepted`

Em seguida abre o diálogo de nova meta de gasto já existente, preenchido com a categoria
nova e `monthly_avg_cents`. Fechar sem salvar é permitido.

**Recusar** marca `dismissed` sem confirmação.

## Erros

- Nome já existente no aceite → erro no diálogo, nada é gravado.
- Falha em qualquer passo do aceite → rollback da transação inteira.
- Falha da rotina numa org → log e segue para a próxima.

## Testes

- **Motor (TDD):** normalização (prefixos, dígitos, cidade, acento); limites A (6/3 meses,
  R$ 300); B exige ≥ 10% e ≥ 2 grupos; categoria com meta não gera B; nome existente não é
  sugerido; fingerprint recusado não volta; teto de 10; ordenação.
- **Execução:** upsert preserva `accepted`/`dismissed`; `pending` obsoleto é apagado.
- **Aceite:** cria categoria + regra; move só lançamentos da origem; rollback em erro.
- **Rota:** 401 sem segredo; GET funciona.
