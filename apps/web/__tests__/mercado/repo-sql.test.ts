import { describe, it, expect } from 'vitest'
import { createDb } from '@floow/db'
import { upsertDeFundos } from '@/lib/mercado/repo'

// postgres() só conecta na primeira consulta; toSQL() não executa nada.
const db = createDb('postgres://ninguem:nada@127.0.0.1:1/nenhum')

const fundo = { cnpj: '1', nome: 'F', classeAnbima: null, taxaAdm: null, taxaPerformance: null, diasConversaoResgate: null, diasPagamentoResgate: null, dataReferencia: '2026-01-01' }

describe('upsert de fundos_cvm', () => {
  it('o cadastro, que não traz prazo de resgate, não apaga o prazo já gravado', () => {
    const { sql } = upsertDeFundos(db, [fundo]).toSQL()
    expect(sql).toMatch(/coalesce\(excluded\.dias_conversao_resgate, "fundos_cvm"\."dias_conversao_resgate"\)/)
    expect(sql).toMatch(/coalesce\(excluded\.dias_pagamento_resgate, "fundos_cvm"\."dias_pagamento_resgate"\)/)
  })
})
