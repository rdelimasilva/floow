# Cash Flow Filters & Chart Types — Design Spec

## Overview

Adicionar filtros temporais acima do grafico de fluxo de caixa e mini cards para escolher entre 6 tipos de grafico (barras agrupadas, empilhadas, linha, area, waterfall, pizza).

## 1. Filtros Temporais

Barra de atalhos acima do grafico, substituindo o hardcoded "12 meses".

### Periodos fixos
- Hoje, Este mes, Este trimestre, Este semestre, Este ano

### Periodos relativos
- Ultimos 3 meses, Ultimos 6 meses, Ultimos 12 meses

### Personalizado
- Date pickers de/ate (reutilizar pattern existente)

### Comportamento
- Default ao abrir: "Ultimos 12m" (comportamento atual)
- Botao ativo: `bg-gray-900 text-white` (mesmo pattern dos filtros de transacoes)
- Botao "Limpar" reseta para default
- Filtro afeta o grafico E a tabela de breakdown
- Estado via `useState` (nao precisa URL params — e visualizacao)

### Impacto no backend
- `getRecentTransactions` ja aceita `months` como parametro. Mudar para aceitar `startDate`/`endDate` opcionais para suportar periodos fixos. Quando nenhum e passado, usa o default de 12 meses.
- Alternativamente, calcular as datas no client e passar cutoff dates. A abordagem mais simples: calcular `startDate`/`endDate` no server component baseado no estado, e passar os dados filtrados ao client.

### Calculo de datas

Reutilizar as funcoes `getPeriodDates` ja criadas no `transaction-filters.tsx`. Extrair para um utilitario compartilhado ou duplicar (sao ~20 linhas).

Funcoes adicionais para periodos relativos:
- `getLastNMonths(n)` — de (hoje - N meses) ate hoje

## 2. Mini Cards de Tipo de Grafico

Linha de 6 mini cards clicaveis entre os filtros temporais e o grafico.

| Card | Icone (lucide) | Label | Recharts Component |
|------|---------------|-------|--------------------|
| Barras agrupadas | `BarChart3` | Barras | `BarChart` + 2x `Bar` |
| Barras empilhadas | `BarChart3` | Empilhado | `BarChart` + 2x `Bar` com `stackId` |
| Linha | `LineChart` | Linha | `LineChart` + 3x `Line` (receita, despesa, saldo) |
| Area | `AreaChart` | Area | `AreaChart` + 2x `Area` |
| Waterfall | `TrendingUp` | Cascata | `BarChart` customizado |
| Pizza/Donut | `PieChart` | Pizza | `PieChart` + `Pie` com totais |

### Visual dos cards
- Layout: flex row, gap-2
- Card inativo: `border border-gray-200 bg-white text-gray-500`
- Card ativo: `border-blue-500 bg-blue-50 text-blue-700`
- Tamanho: icone 16px + label text-xs, padding px-3 py-2, rounded-lg
- Default: "Barras" (grafico atual)

## 3. Grafico Dinamico

### Prop `chartType`

O componente `CashFlowChart` recebe `chartType: ChartType` e renderiza o grafico correspondente.

```typescript
type ChartType = 'bar' | 'stacked' | 'line' | 'area' | 'waterfall' | 'pie'
```

### Implementacao por tipo

**Barras agrupadas (bar)** — Comportamento atual. `BarChart` com 2 `Bar` lado a lado.

**Barras empilhadas (stacked)** — Mesmo `BarChart`, mas ambos `Bar` com `stackId="stack"`. Despesa mostrada como valor absoluto empilhada sobre receita.

**Linha (line)** — `LineChart` com 3 `Line`:
- Receita (verde #16a34a)
- Despesa (vermelho #dc2626, valor absoluto)
- Saldo liquido (azul #2563eb, receita - |despesa|)

**Area (area)** — `AreaChart` com 2 `Area`:
- Receita (verde, fillOpacity 0.3)
- Despesa (vermelho, fillOpacity 0.3, valor absoluto)

**Waterfall (waterfall)** — `BarChart` com barra invisivel de base + barra de delta colorida:
- Delta positivo (receita > despesa): verde
- Delta negativo: vermelho
- Base = saldo acumulado ate o mes anterior

**Pizza/Donut (pie)** — `PieChart` com 2 fatias: total receita vs total despesa do periodo.
- Receita: verde
- Despesa: vermelho
- Label central: saldo liquido

### Dados

Todos os tipos usam o mesmo array `CashFlowMonth[]` retornado por `aggregateCashFlow()`. Os tipos derivados (saldo liquido, acumulado) sao calculados no componente.

## 4. Componentes

### `cash-flow-period-filter.tsx` (novo)

Componente client com a barra de atalhos de periodo. Emite `onChange(startDate, endDate)`.

### `cash-flow-chart-picker.tsx` (novo)

Componente client com os mini cards de tipo de grafico. Emite `onChange(chartType)`.

### `cash-flow-chart.tsx` (modificar)

Aceita nova prop `chartType`. Renderiza o grafico correspondente. Extrair cada tipo em funcao interna para manter o arquivo legivel.

### `cash-flow/page.tsx` (modificar)

- Tornar interativo: extrair um client wrapper que gerencia estado de periodo + tipo de grafico
- Server component busca dados baseado no periodo
- Reorganizar layout: filtros → cards de tipo → grafico → breakdown

## 5. Arquivos a criar/modificar

### Novos
- `apps/web/components/finance/cash-flow-period-filter.tsx`
- `apps/web/components/finance/cash-flow-chart-picker.tsx`
- `apps/web/components/finance/cash-flow-client.tsx` (client wrapper para estado)

### Modificar
- `apps/web/components/finance/cash-flow-chart.tsx` — aceitar `chartType`, renderizar 6 tipos
- `apps/web/app/(app)/cash-flow/page.tsx` — usar client wrapper, passar dados filtrados
- `apps/web/components/finance/cash-flow-breakdown.tsx` — receber periodo do parent em vez de gerenciar proprio
