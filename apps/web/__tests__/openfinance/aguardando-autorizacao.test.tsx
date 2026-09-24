import { describe, it, expect, vi } from 'vitest'
import { render, renderHook, screen } from '@testing-library/react'
import React from 'react'
import {
  AvisoDeAutorizacao, useAtualizarAoVoltar,
} from '@/app/(app)/accounts/connect/aguardando-autorizacao'

describe('aviso de autorização em outra aba', () => {
  it('diz para concluir no banco e voltar', () => {
    render(<AvisoDeAutorizacao />)
    expect(screen.getByText('Conclua a autorização na aba do banco. Quando terminar, volte para esta aba.')).toBeDefined()
  })
})

describe('useAtualizarAoVoltar', () => {
  it('atualiza quando a aba volta a ficar visível ou ganha foco', () => {
    const atualizar = vi.fn()
    let agora = 0
    renderHook(() => useAtualizarAoVoltar(true, atualizar, () => agora))
    document.dispatchEvent(new Event('visibilitychange'))
    expect(atualizar).toHaveBeenCalledTimes(1)
    agora = 5_000
    window.dispatchEvent(new Event('focus'))
    expect(atualizar).toHaveBeenCalledTimes(2)
  })

  it('visibilidade e foco da mesma volta contam uma vez só', () => {
    const atualizar = vi.fn()
    let agora = 10_000
    renderHook(() => useAtualizarAoVoltar(true, atualizar, () => agora))
    document.dispatchEvent(new Event('visibilitychange'))
    agora += 100
    window.dispatchEvent(new Event('focus'))
    expect(atualizar).toHaveBeenCalledTimes(1)
  })

  it('inativo (nenhuma aba aberta): não escuta nada', () => {
    const atualizar = vi.fn()
    renderHook(() => useAtualizarAoVoltar(false, atualizar))
    window.dispatchEvent(new Event('focus'))
    expect(atualizar).not.toHaveBeenCalled()
  })

  it('aba escondida não dispara atualização', () => {
    const atualizar = vi.fn()
    const spy = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    renderHook(() => useAtualizarAoVoltar(true, atualizar))
    document.dispatchEvent(new Event('visibilitychange'))
    expect(atualizar).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})
