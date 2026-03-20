# Transaction Filters & Column Sorting — Design Spec

## Overview

Adicionar atalhos de periodo (Hoje, Este mes, etc.) acima dos filtros existentes, ordenacao por coluna (click no header), e filtros por coluna (icone funil) na tabela de transacoes.

## 1. Atalhos de Periodo

Barra de botoes acima dos filtros atuais no `transaction-filters.tsx`:

| Botao | startDate | endDate |
|-------|-----------|---------|
| Hoje | hoje | hoje |
| Este mes | primeiro dia do mes | ultimo dia do mes |
| Este trimestre | primeiro dia do trimestre | ultimo dia do trimestre |
| Este semestre | primeiro dia do semestre | ultimo dia do semestre |
| Este ano | 1 jan do ano | 31 dez do ano |

- Botao ativo fica destacado (bg-gray-900 text-white)
- Ao clicar, preenche `startDate` e `endDate` nos search params e navega
- Se o usuario alterar os date pickers manualmente, nenhum botao fica ativo (modo "personalizado" implicito)
- "Limpar filtros" reseta tudo incluindo o periodo ativo

### Calculo de datas

Funcoes puras que recebem `today: Date` e retornam `{ startDate: string, endDate: string }` no formato `YYYY-MM-DD`:

- `getToday(today)` — mesmo dia
- `getThisMonth(today)` — 1o ao ultimo dia do mes
- `getThisQuarter(today)` — trimestres: jan-mar, abr-jun, jul-set, out-dez
- `getThisSemester(today)` — semestres: jan-jun, jul-dez
- `getThisYear(today)` — 1 jan a 31 dez

## 2. Ordenacao por Coluna

### URL params

- `sortBy`: `date` | `description` | `categoryName` | `type` | `amountCents` (default: `date`)
- `sortDir`: `asc` | `desc` (default: `desc`)

### UX

- Click no texto do header alterna a direcao de ordenacao
- Coluna ativa mostra icone `ChevronUp` (asc) ou `ChevronDown` (desc) ao lado do texto
- Colunas inativas nao mostram icone de direcao

### Backend

`getTransactions` recebe `sortBy` e `sortDir` opcionais. Mapeia `sortBy` para a coluna Drizzle correspondente:

```typescript
const sortColumns = {
  date: transactions.date,
  description: transactions.description,
  categoryName: categories.name,
  type: transactions.type,
  amountCents: transactions.amountCents,
}
```

Manter o sort secundario: `desc(transactions.balanceApplied)` sempre vem primeiro (transacoes aplicadas antes das futuras), seguido pelo sort do usuario.

`getTransactionCount` NAO precisa de sort.

## 3. Filtros por Coluna

### UX

- Icone de funil (lucide `Filter`) no header, ao lado do texto
- Click no funil abre um dropdown posicionado abaixo do header
- Filtro ativo: funil fica azul (text-blue-600)
- Dropdown fecha ao clicar fora ou selecionar

### Filtros por coluna

| Coluna | Tipo de filtro | Componente |
|--------|---------------|------------|
| Data | — (coberto pelos atalhos de periodo) | Sem funil |
| Descricao | — (coberto pela busca no topo) | Sem funil |
| Categoria | Checkboxes multi-select | Lista de categorias do org |
| Tipo | Checkboxes multi-select | Receita, Despesa, Transferencia |
| Valor | Range min/max | Dois inputs numericos |

### URL params

- `types`: string separada por virgula (ex: `income,expense`)
- `categoryIds`: string separada por virgula (ex: `uuid1,uuid2`)
- `minAmount`: inteiro em centavos
- `maxAmount`: inteiro em centavos

### Backend

`getTransactions` e `getTransactionCount` recebem os novos filtros opcionais e adicionam condicoes ao `where`:

- `types` → `inArray(transactions.type, types.split(','))`
- `categoryIds` → `inArray(transactions.categoryId, ids.split(','))`
- `minAmount` → `gte(sql\`ABS(amount_cents)\`, minAmount)`
- `maxAmount` → `lte(sql\`ABS(amount_cents)\`, maxAmount)`

Nota: filtro de valor usa `ABS()` porque despesas sao negativas no banco.

## 4. Componentes

### `transaction-filters.tsx` (modificar)

- Adicionar barra de atalhos de periodo acima dos filtros atuais
- Manter busca, conta e date range existentes
- Os date pickers continuam funcionando para range customizado

### `sortable-header.tsx` (novo)

Componente reutilizavel para header de coluna com ordenacao:

```typescript
interface SortableHeaderProps {
  label: string
  sortKey: string
  currentSortBy: string
  currentSortDir: 'asc' | 'desc'
  filterContent?: React.ReactNode  // conteudo do dropdown de filtro
  hasActiveFilter?: boolean
  onSort: (sortBy: string) => void
}
```

- Renderiza `<th>` com texto clicavel + icone de direcao + icone de funil
- Click no texto chama `onSort`
- Click no funil abre/fecha dropdown
- Dropdown renderiza `filterContent` passado como prop

### `column-filter-dropdown.tsx` (novo)

Dropdown generico posicionado abaixo do header:

- `TypeFilter`: checkboxes para income/expense/transfer
- `CategoryFilter`: checkboxes com lista de categorias
- `AmountFilter`: inputs min/max com botao "Aplicar"

### `transaction-list.tsx` (modificar)

- Substituir headers estaticos por `SortableHeader`
- Passar filtros e handlers de sort/filtro
- Receber `sortBy`, `sortDir` e filtros como props (via URL params da page)

### `page.tsx` (modificar)

- Ler novos search params: `sortBy`, `sortDir`, `types`, `categoryIds`, `minAmount`, `maxAmount`
- Passar para `getTransactions` e `getTransactionCount`
- Passar para `TransactionList` como props

## 5. Arquivos a criar/modificar

### Novos
- `apps/web/components/finance/sortable-header.tsx`
- `apps/web/components/finance/column-filter-dropdown.tsx`

### Modificar
- `apps/web/components/finance/transaction-filters.tsx` — atalhos de periodo
- `apps/web/components/finance/transaction-list.tsx` — headers com sort + filtros
- `apps/web/app/(app)/transactions/page.tsx` — novos search params
- `apps/web/lib/finance/queries.ts` — `getTransactions` sort + novos filtros, `getTransactionCount` novos filtros
