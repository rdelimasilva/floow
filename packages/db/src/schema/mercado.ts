import { customType, pgTable, text, date, integer, boolean, timestamp, uuid, primaryKey, index } from 'drizzle-orm/pg-core'

// Dados públicos de mercado, iguais para todo mundo: sem org_id. Os jobs de
// apps/web/lib/mercado escrevem; as regras do agente só leem.

/** `numeric(p, s)` lido como `number`. Nada aqui é dinheiro da pessoa, então não vai em centavos. */
function numero(precisao: number, escala: number) {
  return customType<{ data: number; driverData: string }>({
    dataType: () => `numeric(${precisao}, ${escala})`,
    fromDriver: (v) => Number(v),
    toDriver: (v) => String(v),
  })
}

export const indicadoresDiarios = pgTable(
  'indicadores_diarios',
  {
    serie: text('serie').notNull(),
    data: date('data').notNull(),
    // Como a fonte publica: CDI e Selic em % ao dia, IPCA em % ao mês.
    valor: numero(18, 8)('valor').notNull(),
  },
  (t) => [primaryKey({ columns: [t.serie, t.data] })],
)

export const cotacoesB3 = pgTable(
  'cotacoes_b3',
  {
    ticker: text('ticker').notNull(),
    data: date('data').notNull(),
    fechamento: numero(18, 6)('fechamento').notNull(),
  },
  (t) => [primaryKey({ columns: [t.ticker, t.data] })],
)

export const cotasFundos = pgTable(
  'cotas_fundos',
  {
    cnpj: text('cnpj').notNull(),
    data: date('data').notNull(),
    cota: numero(28, 12)('cota').notNull(),
    patrimonio: numero(20, 2)('patrimonio'),
  },
  (t) => [primaryKey({ columns: [t.cnpj, t.data] })],
)

export const fundosCvm = pgTable('fundos_cvm', {
  cnpj: text('cnpj').primaryKey(),
  // CNPJ que aparece no informe diário; desde a CVM 175 pode ser o da classe.
  cnpjClasse: text('cnpj_classe'),
  nome: text('nome').notNull(),
  classeAnbima: text('classe_anbima'),
  taxaAdm: numero(10, 4)('taxa_adm'),
  taxaPerformance: numero(10, 4)('taxa_performance'),
  diasConversaoResgate: integer('dias_conversao_resgate'),
  diasPagamentoResgate: integer('dias_pagamento_resgate'),
  dataReferencia: date('data_referencia').notNull(),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
})

export const tesouroPrecos = pgTable(
  'tesouro_precos',
  {
    tipo: text('tipo').notNull(),
    vencimento: date('vencimento').notNull(),
    data: date('data').notNull(),
    taxaCompra: numero(10, 4)('taxa_compra'),
    taxaVenda: numero(10, 4)('taxa_venda'),
    puCompra: numero(18, 6)('pu_compra'),
    puVenda: numero(18, 6)('pu_venda'),
  },
  (t) => [primaryKey({ columns: [t.tipo, t.vencimento, t.data] })],
)

export const execucoesMercado = pgTable(
  'execucoes_mercado',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    job: text('job').notNull(),
    inicio: timestamp('inicio', { withTimezone: true }).notNull(),
    fim: timestamp('fim', { withTimezone: true }).notNull(),
    ok: boolean('ok').notNull(),
    linhas: integer('linhas').notNull(),
    erro: text('erro'),
  },
  (t) => [index('idx_execucoes_mercado_job_inicio').on(t.job, t.inicio.desc())],
)
