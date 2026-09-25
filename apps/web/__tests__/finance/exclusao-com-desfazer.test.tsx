import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useExclusaoComDesfazer } from '@/components/finance/use-exclusao-com-desfazer'

/**
 * Excluir uma transação pedia confirmação e era irreversível. Agora a linha
 * some na hora, o aviso oferece "Desfazer" e a exclusão só vai ao banco quando
 * o prazo acaba — ou quando o usuário sai da tela.
 */
const TX = { id: 't1', transferGroupId: null, description: 'Mercado', balanceApplied: true, recurringTemplateId: null }
const PERNA = { id: 't2', transferGroupId: 'g1', description: 'Poupar', balanceApplied: true, recurringTemplateId: null }

let excluir: ReturnType<typeof vi.fn>
let toast: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.useFakeTimers()
  excluir = vi.fn(async () => undefined)
  toast = vi.fn()
})
afterEach(() => vi.useRealTimers())

function montar() {
  return renderHook(() => useExclusaoComDesfazer({ excluir, toast }))
}

describe('useExclusaoComDesfazer', () => {
  it('esconde a linha na hora e só exclui depois do prazo', async () => {
    const { result } = montar()
    act(() => result.current.pedir(TX))

    expect(result.current.oculta(TX)).toBe(true)
    expect(excluir).not.toHaveBeenCalled()

    await act(async () => vi.advanceTimersByTime(8000))
    expect(excluir).toHaveBeenCalledWith('t1')
  })

  it('desfazer devolve a linha e cancela a exclusão', async () => {
    const { result } = montar()
    act(() => result.current.pedir(TX))

    const [, , opcoes] = toast.mock.calls[0]
    act(() => opcoes.acao.onClick())

    expect(result.current.oculta(TX)).toBe(false)
    await act(async () => vi.advanceTimersByTime(10_000))
    expect(excluir).not.toHaveBeenCalled()
  })

  it('transferência esconde as duas pernas', () => {
    const { result } = montar()
    act(() => result.current.pedir(PERNA))

    expect(result.current.oculta({ id: 'outra-perna', transferGroupId: 'g1' })).toBe(true)
  })

  it('sair da tela antes do prazo exclui na hora', () => {
    const { result, unmount } = montar()
    act(() => result.current.pedir(TX))

    unmount()
    expect(excluir).toHaveBeenCalledWith('t1')
  })

  it('se a exclusão falhar, a linha volta e o erro aparece', async () => {
    excluir.mockRejectedValue(new Error('Transação conciliada não pode ser removida.'))
    const { result } = montar()
    act(() => result.current.pedir(TX))

    await act(async () => vi.advanceTimersByTime(8000))
    expect(result.current.oculta(TX)).toBe(false)
    expect(toast).toHaveBeenLastCalledWith('Transação conciliada não pode ser removida.', 'error')
  })
})
