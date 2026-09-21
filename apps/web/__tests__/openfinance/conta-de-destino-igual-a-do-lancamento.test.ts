import { describe, it, expect } from 'vitest'
import { avisoDeContaDeDestino } from '@/lib/openfinance/transfer-conflict'

/**
 * Transferência para a própria conta do lançamento: avisar na tela, não
 * estourar no servidor.
 *
 * `applyTransferSingle` (counterparty-actions.ts:106) recusa destino igual à
 * conta de origem — e está certo: seria dinheiro saindo e entrando no mesmo
 * lugar. Só que a fila de revisão oferecia TODAS as contas no seletor, então
 * escolher a conta onde os próprios lançamentos estão era possível, e o lote
 * inteiro morria com "A conta da transferência não pode ser a mesma conta do
 * lançamento." depois de já ter sido enviado. Aconteceu em produção em
 * 16/09/2026.
 *
 * O aviso conta quantos lançamentos batem, porque o grupo de uma contraparte
 * pode ter lançamentos de contas diferentes: escolher o Itaú com 2 de 5
 * lançamentos no Itaú quebra só aqueles dois, e quem lê precisa saber disso.
 *
 * Só olha os lançamentos que seguem o padrão do grupo. Quem tem exceção
 * própria não é afetado pela conta do grupo — é o mesmo recorte que o
 * servidor faz entre `applyTransferBatch` e as exceções.
 */

const ITAU = { id: 'acc-itau', name: 'Itaú' }

const item = (id: string, accountId: string) => ({ id, accountId })

describe('aviso de conta de destino', () => {
  it('sem conta escolhida, nada a avisar', () => {
    expect(avisoDeContaDeDestino([item('t1', 'acc-itau')], null, [ITAU])).toBeNull()
  })

  it('destino diferente da conta dos lançamentos: nada a avisar', () => {
    expect(avisoDeContaDeDestino([item('t1', 'acc-itau')], 'acc-nubank', [ITAU])).toBeNull()
  })

  it('todos os lançamentos na conta escolhida: avisa com o total', () => {
    const aviso = avisoDeContaDeDestino(
      [item('t1', 'acc-itau'), item('t2', 'acc-itau'), item('t3', 'acc-itau')],
      'acc-itau',
      [ITAU],
    )

    expect(aviso).toBe(
      'Os 3 lançamentos desta contraparte estão no Itaú. Escolha outra conta de destino.',
    )
  })

  it('um lançamento só: fala no singular', () => {
    const aviso = avisoDeContaDeDestino([item('t1', 'acc-itau')], 'acc-itau', [ITAU])

    expect(aviso).toBe(
      'O lançamento desta contraparte está no Itaú. Escolha outra conta de destino.',
    )
  })

  it('parte dos lançamentos: diz quantos de quantos', () => {
    const aviso = avisoDeContaDeDestino(
      [item('t1', 'acc-itau'), item('t2', 'acc-nubank'), item('t3', 'acc-itau')],
      'acc-itau',
      [ITAU],
    )

    expect(aviso).toBe(
      '2 dos 3 lançamentos desta contraparte estão no Itaú. Escolha outra conta de destino.',
    )
  })

  it('conta sem nome conhecido não vira "undefined" na frase', () => {
    const aviso = avisoDeContaDeDestino([item('t1', 'acc-x')], 'acc-x', [])

    expect(aviso).toContain('nesta conta')
    expect(aviso).not.toContain('undefined')
  })

  it('lista vazia de lançamentos não inventa aviso', () => {
    expect(avisoDeContaDeDestino([], 'acc-itau', [ITAU])).toBeNull()
  })
})
