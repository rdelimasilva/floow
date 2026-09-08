import { describe, it, expect } from 'vitest'
import { accountTypeEnum } from '@floow/db'
import { ACCOUNT_TYPE_LABEL, ACCOUNT_TYPE_OPTIONS } from '@/lib/finance/account-types'

/**
 * O rótulo de tipo de conta estava duplicado em quatro mapas — dois em
 * `account-card.tsx`, um na página da conta, um no formulário de nova conta —
 * mais dois nos gráficos. Eles divergiram: `brokerage` era "Corretora" na UI
 * de contas e "Investimento" nos gráficos, e `cash` era "Dinheiro" em três
 * lugares e "Dinheiro em Espécie" no formulário.
 *
 * Fonte única + este teste fecham a classe do problema: enum novo sem rótulo
 * quebra aqui, em vez de aparecer como `undefined` em uma tela só.
 */

describe('rótulos de tipo de conta', () => {
  it('brokerage é "Investimento" — cobre corretora e investimento de banco', () => {
    // "Corretora" era estreito: CDB no Itaú não é corretora nem poupança, e é
    // o caso que aparece na transferência da fila de contrapartes. O que
    // distingue XP de Itaú é a instituição, não o tipo.
    expect(ACCOUNT_TYPE_LABEL.brokerage).toBe('Investimento')
  })

  it('tem rótulo para todo valor de accountTypeEnum', () => {
    for (const value of accountTypeEnum.enumValues) {
      expect(ACCOUNT_TYPE_LABEL[value], `sem rótulo para "${value}"`).toBeTruthy()
    }
  })

  it('as opções do formulário cobrem o enum, na mesma ordem', () => {
    expect(ACCOUNT_TYPE_OPTIONS.map((o) => o.value)).toEqual([...accountTypeEnum.enumValues])
  })
})
