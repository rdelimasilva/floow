import { describe, it, expect } from 'vitest'
import { getTableConfig } from 'drizzle-orm/pg-core'
import {
  indicadoresDiarios,
  cotacoesB3,
  cotasFundos,
  fundosCvm,
  tesouroPrecos,
  execucoesMercado,
} from '../schema/mercado'

function pk(t: Parameters<typeof getTableConfig>[0]) {
  const cfg = getTableConfig(t)
  const composta = cfg.primaryKeys[0]?.columns.map((c) => c.name)
  return composta ?? cfg.columns.filter((c) => c.primary).map((c) => c.name)
}

const colunas = (t: Parameters<typeof getTableConfig>[0]) => getTableConfig(t).columns.map((c) => c.name)

describe('schema de dados de mercado', () => {
  it('tabelas com nome SQL e chave primária do spec', () => {
    expect(getTableConfig(indicadoresDiarios).name).toBe('indicadores_diarios')
    expect(pk(indicadoresDiarios)).toEqual(['serie', 'data'])
    expect(getTableConfig(cotacoesB3).name).toBe('cotacoes_b3')
    expect(pk(cotacoesB3)).toEqual(['ticker', 'data'])
    expect(getTableConfig(cotasFundos).name).toBe('cotas_fundos')
    expect(pk(cotasFundos)).toEqual(['cnpj', 'data'])
    expect(getTableConfig(fundosCvm).name).toBe('fundos_cvm')
    expect(pk(fundosCvm)).toEqual(['cnpj'])
    expect(getTableConfig(tesouroPrecos).name).toBe('tesouro_precos')
    expect(pk(tesouroPrecos)).toEqual(['tipo', 'vencimento', 'data'])
    expect(getTableConfig(execucoesMercado).name).toBe('execucoes_mercado')
  })

  it('fundos_cvm guarda taxa, liquidez e o CNPJ da classe', () => {
    expect(colunas(fundosCvm)).toEqual(
      expect.arrayContaining(['cnpj_classe', 'taxa_adm', 'taxa_performance', 'dias_conversao_resgate', 'dias_pagamento_resgate', 'data_referencia']),
    )
  })

  it('nenhuma tabela de mercado tem org_id', () => {
    for (const t of [indicadoresDiarios, cotacoesB3, cotasFundos, fundosCvm, tesouroPrecos, execucoesMercado]) {
      expect(colunas(t)).not.toContain('org_id')
    }
  })
})
