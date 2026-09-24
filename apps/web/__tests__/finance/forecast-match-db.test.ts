import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'

/**
 * O passo que PROPÕE, nesta conta, o par previsto×realizado que o casamento
 * encontrar. Antes gravava `matched_transaction_id` direto — a previsão era
 * declarada cumprida sem ninguém olhar. Agora só insere a proposta; quem
 * efetiva é o usuário, na aprovação (tarefa seguinte).
 *
 * Roda depois da importação e não dentro do `persistPage`: o `returning` do
 * insert de lá traz só id, valor e `balanceApplied`, sem data nem descrição —
 * e é delas que o casamento depende. Como passo separado também cobre o caso
 * inverso, o realizado que chegou antes de o previsto existir.
 *
 * Só previsto ABERTO entra (`balance_applied = false`). Os que já foram
 * aplicados no saldo são o problema do passado, decisão que o dono do produto
 * ainda não tomou.
 */

const selectQueue: unknown[][] = []
const inserts: { payload?: Record<string, unknown> }[] = []
const updates: { payload?: Record<string, unknown> }[] = []
/**
 * As condições que cada `.where()` recebeu, na ordem: [0] previstos abertos,
 * [1] realizados candidatos. O mock não tem banco, então a única forma de
 * provar um FILTRO é olhar a condição que foi montada — renderizada com
 * `PgDialect`, como em `previsao-sem-proposta-aberta-sql.test.ts`.
 */
const wheres: SQL[] = []

const dialect = new PgDialect()
const sqlDoWhere = (i: number) => dialect.sqlToQuery(wheres[i]).sql.toLowerCase()

function chain(result: unknown[], current?: { payload?: Record<string, unknown> }): any {
  const c: any = {
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
  }
  for (const m of ['from', 'limit', 'returning', 'orderBy', 'onConflictDoNothing']) {
    c[m] = () => chain(result, current)
  }
  c.where = (condicao: SQL) => {
    wheres.push(condicao)
    return chain(result, current)
  }
  c.set = (payload: Record<string, unknown>) => {
    if (current) current.payload = payload
    return chain(result, current)
  }
  c.values = (payload: Record<string, unknown>) => {
    if (current) current.payload = payload
    return chain(result, current)
  }
  return c
}

const mockDb = {
  select: () => chain(selectQueue.shift() ?? []),
  insert: () => {
    const op: { payload?: Record<string, unknown> } = {}
    inserts.push(op)
    return chain([{ id: 'proposta-1' }], op)
  },
  update: () => {
    const op: { payload?: Record<string, unknown> } = {}
    updates.push(op)
    return chain([], op)
  },
}

vi.mock('@floow/db', async () => {
  const actual = await vi.importActual<typeof import('@floow/db')>('@floow/db')
  return { ...actual, getDb: () => mockDb }
})

const { criarPropostasDeConciliacao } = await import('@/lib/finance/forecast-match-db')

const CONTA = 'conta-1'

const PREVISTO_SALARIO = {
  id: 'prev-salario',
  amountCents: 3_250_000,
  date: new Date('2026-10-15T00:00:00Z'),
  description: 'Salário - Soma Cooperativa (10/61)',
}

const REAL_SALARIO = {
  id: 'real-salario',
  amountCents: 3_263_885,
  date: new Date('2026-10-15T00:00:00Z'),
  description: 'Entrada SOMA COOPERATIVA DE TRABALHO EM TECNOLOGIA DA INFORMACAO',
}

beforeEach(() => {
  selectQueue.length = 0
  inserts.length = 0
  updates.length = 0
  wheres.length = 0
})

describe('criarPropostasDeConciliacao', () => {
  it('propõe o par previsto×realizado que o casamento encontrou', async () => {
    selectQueue.push([PREVISTO_SALARIO]) // previstos abertos
    selectQueue.push([REAL_SALARIO]) // realizados que nenhuma previsão reivindicou

    const total = await criarPropostasDeConciliacao(mockDb as never, 'org-1', CONTA)

    expect(total).toBe(1)
    expect(inserts).toHaveLength(1)
    expect(inserts[0].payload).toMatchObject({
      orgId: 'org-1',
      forecastTransactionId: 'prev-salario',
      realizedTransactionId: 'real-salario',
      status: 'pending',
    })
    // O vínculo continua intocado: quem efetiva é a aprovação, não o sync.
    expect(updates).toHaveLength(0)
  })

  /**
   * O realizado que JÁ é alvo de um vínculo sai da lista de candidatos.
   *
   * Os índices da 00047 não fecham isso: `uq_fmp_realizado_pendente` é parcial
   * em `status = 'pending'`, então a proposta aprovada sai do índice e um
   * segundo previsto pode ser proposto para o mesmo realizado. Templates
   * "Aluguel" R$ 1.200 dia 01 e "Condomínio" R$ 1.200 dia 05, um débito de
   * R$ 1.200 no dia 03: aprovada a proposta (Aluguel, R), o sync seguinte
   * propõe (Condomínio, R) — e na fila "É o mesmo" viola
   * `idx_transactions_matched_unique` da 00042, a action estoura, e a proposta
   * fica presa na fila e no contador do badge para sempre. O `Set` de
   * `reivindicados` não cobre: ele só protege dentro de uma rodada, e só do
   * lado da previsão.
   */
  it('realizado que uma previsão já reivindicou não vira proposta', async () => {
    selectQueue.push([PREVISTO_SALARIO])
    selectQueue.push([REAL_SALARIO])

    await criarPropostasDeConciliacao(mockDb as never, 'org-1', CONTA)

    const realizados = sqlDoWhere(1)
    expect(realizados).toContain('not exists (select 1 from "transactions"')
    expect(realizados).toContain('"matched_transaction_id" = "transactions"."id"')
  })

  it('previsão com proposta aberta não vira candidata de novo', async () => {
    selectQueue.push([PREVISTO_SALARIO])
    selectQueue.push([REAL_SALARIO])

    await criarPropostasDeConciliacao(mockDb as never, 'org-1', CONTA)

    expect(sqlDoWhere(0)).toContain('not exists (select 1 from "forecast_match_proposals"')
  })

  it('não escreve nada quando não há previsto aberto', async () => {
    selectQueue.push([]) // nenhum previsto

    const total = await criarPropostasDeConciliacao(mockDb as never, 'org-1', CONTA)

    expect(total).toBe(0)
    expect(inserts).toHaveLength(0)
  })

  it('um realizado não é reivindicado por duas propostas', async () => {
    // Duas previsões iguais na mesma data: só uma pode casar com o único
    // realizado, senão o índice único parcial do banco estouraria.
    const segundo = { ...PREVISTO_SALARIO, id: 'prev-duplicado' }
    selectQueue.push([PREVISTO_SALARIO, segundo])
    selectQueue.push([REAL_SALARIO])

    const total = await criarPropostasDeConciliacao(mockDb as never, 'org-1', CONTA)

    expect(total).toBe(1)
    expect(inserts).toHaveLength(1)
  })

  it('não propõe quando o realizado não corresponde a nenhum previsto', async () => {
    const nadaAVer = {
      id: 'real-outro',
      amountCents: -4_500,
      date: new Date('2026-10-15T00:00:00Z'),
      description: 'Padaria do Zé',
    }
    selectQueue.push([PREVISTO_SALARIO])
    selectQueue.push([nadaAVer])

    expect(await criarPropostasDeConciliacao(mockDb as never, 'org-1', CONTA)).toBe(0)
    expect(inserts).toHaveLength(0)
  })

  it('realizado fora da janela de data não vira proposta', async () => {
    // JANELA_BUSCA_DIAS é 10; a consulta de realizados já filtra por essa
    // janela no banco — aqui simulamos o resultado já filtrado (vazio) para
    // cobrir o caso em que nada retorna por estar fora da janela.
    selectQueue.push([PREVISTO_SALARIO])
    selectQueue.push([])

    const total = await criarPropostasDeConciliacao(mockDb as never, 'org-1', CONTA)

    expect(total).toBe(0)
    expect(inserts).toHaveLength(0)
  })

  it('quando o insert colide (onConflictDoNothing), não conta como criada', async () => {
    selectQueue.push([PREVISTO_SALARIO])
    selectQueue.push([REAL_SALARIO])

    // Simula o índice único parcial barrando: o insert devolve vazio porque
    // já existe proposta pendente ou par recusado, e não deve estourar.
    mockDb.insert = () => {
      const op: { payload?: Record<string, unknown> } = {}
      inserts.push(op)
      return chain([], op)
    }

    const total = await criarPropostasDeConciliacao(mockDb as never, 'org-1', CONTA)

    expect(total).toBe(0)
    expect(inserts).toHaveLength(1)

    // Restaura o comportamento padrão para não vazar entre testes.
    mockDb.insert = () => {
      const op: { payload?: Record<string, unknown> } = {}
      inserts.push(op)
      return chain([{ id: 'proposta-1' }], op)
    }
  })

  it('perna prevista de transferência entra como previsão', async () => {
    selectQueue.push([]) // nenhum previsto: basta ver a condição montada
    await criarPropostasDeConciliacao(mockDb as never, 'org-1', CONTA)
    const q = dialect.sqlToQuery(wheres[0])
    expect(q.sql).toContain('"recurring_template_id" is not null')
    expect(q.sql).toContain('"external_id" like')
    expect(q.params).toContain('%:transfer-par')
  })

  it('perna prevista nunca é candidata a realizado', async () => {
    selectQueue.push([PREVISTO_SALARIO])
    selectQueue.push([])
    await criarPropostasDeConciliacao(mockDb as never, 'org-1', CONTA)
    const q = dialect.sqlToQuery(wheres[1])
    expect(q.sql).toContain('not like')
    expect(q.params).toContain('%:transfer-par')
  })

  it('transferência de valor exato casa com a perna prevista', async () => {
    const PERNA = { id: 'perna-1', amountCents: 50000, date: new Date('2026-10-10T00:00:00Z'), description: 'Transferência recebida' }
    const PIX = { id: 'pix-1', amountCents: 50000, date: new Date('2026-10-10T00:00:00Z'), description: 'PIX RECEBIDO FULANO' }
    selectQueue.push([PERNA])
    selectQueue.push([PIX])
    const total = await criarPropostasDeConciliacao(mockDb as never, 'org-1', CONTA)
    expect(total).toBe(1)
    expect(inserts[0].payload).toMatchObject({ forecastTransactionId: 'perna-1', realizedTransactionId: 'pix-1' })
  })
})
