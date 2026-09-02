import { describe, it, expect } from 'vitest'
import { POLP_TAXONOMY, rootForRef, allRefs, kindForRef } from '../../openfinance/taxonomy'

/**
 * A taxonomia é dado grande demais para confiar em revisão visual: ~150 nós
 * transcritos da doc. Estes testes travam as invariantes que, se quebradas,
 * causariam dano silencioso — categoria duplicada, gasto perdido, ou uma
 * transferência contada como despesa.
 */
describe('POLP_TAXONOMY', () => {
  it('não tem ref repetido em nenhum nível', () => {
    const refs = allRefs()
    expect(new Set(refs).size).toBe(refs.length)
  })

  it('toda filha começa com o prefixo da sua raiz', () => {
    // A convenção da Polp é FOOD_AND_DRINK -> FOOD_AND_DRINK_GROCERIES. Uma
    // filha fora do prefixo indica erro de transcrição, e cairia na raiz errada.
    for (const root of POLP_TAXONOMY) {
      for (const child of root.children) {
        expect(child.ref.startsWith(root.ref + '_')).toBe(true)
      }
    }
  })

  it('resolve qualquer ref para a sua raiz', () => {
    expect(rootForRef('FOOD_AND_DRINK_GROCERIES')?.ref).toBe('FOOD_AND_DRINK')
    expect(rootForRef('FOOD_AND_DRINK')?.ref).toBe('FOOD_AND_DRINK')
    expect(rootForRef('REF_QUE_NAO_EXISTE')).toBeUndefined()
  })

  it('não repete floowAlias — um alias duplicado criaria categoria órfã', () => {
    // Se dois nós reivindicassem "Alimentação", o seed vincularia um deles e o
    // outro viraria categoria nova, com gastos caindo fora do orçamento.
    const aliases: string[] = []
    for (const root of POLP_TAXONOMY) {
      if (root.floowAlias) aliases.push(root.floowAlias)
      for (const child of root.children) {
        if (child.floowAlias) aliases.push(child.floowAlias)
      }
    }
    expect(new Set(aliases).size).toBe(aliases.length)
  })

  it('mapeia as categorias de sistema do floow que têm equivalente', () => {
    const aliases = new Set<string>()
    for (const root of POLP_TAXONOMY) {
      if (root.floowAlias) aliases.add(root.floowAlias)
      for (const child of root.children) {
        if (child.floowAlias) aliases.add(child.floowAlias)
      }
    }

    // Nomes conferidos contra o seed de 00002 + as correções de acento de 00008.
    // Errar um acento aqui criaria uma segunda "Saude" ao lado de "Saúde".
    for (const name of [
      'Salário',
      'Freelance',
      'Investimentos',
      'Aluguel',
      'Alimentação',
      'Transporte',
      'Saúde',
      'Educação',
      'Lazer',
      'Outros',
    ]) {
      expect(aliases.has(name)).toBe(true)
    }

    // "Assinaturas" não tem equivalente na taxonomia da Polp: é transversal
    // (streaming cai em ENTERTAINMENT, telefonia em RENT_AND_UTILITIES).
    // Fica sem alias de propósito, e sobrevive como categoria própria.
    expect(aliases.has('Assinaturas')).toBe(false)
  })

  it('classifica transferências como transfer, não como despesa', () => {
    // Um aporte em poupança tratado como gasto inflaria o orçamento com
    // dinheiro que apenas mudou de lugar.
    expect(kindForRef('TRANSFER_OUT_SAVINGS')).toBe('transfer')
    expect(kindForRef('TRANSFER_IN_DEPOSIT')).toBe('transfer')
    expect(kindForRef('FOOD_AND_DRINK_GROCERIES')).toBe('expense')
    expect(kindForRef('INCOME_SALARY')).toBe('income')
  })

  it('cobre as 18 raízes da taxonomia e mais de 130 nós no total', () => {
    // Trava a contagem: se uma raiz sumir numa refatoração, as transações dela
    // deixam de resolver e caem silenciosamente em "sem categoria".
    expect(POLP_TAXONOMY).toHaveLength(18)
    expect(allRefs().length).toBeGreaterThan(130)
  })
})
