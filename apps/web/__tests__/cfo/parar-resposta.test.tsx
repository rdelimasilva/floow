import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'

const stop = vi.fn()
let isStreaming = true
vi.mock('@/hooks/use-chat', () => ({
  useChat: () => ({ messages: [], isStreaming, error: null, sendMessage: vi.fn(), confirmAction: vi.fn(), stop }),
}))

Element.prototype.scrollTo = vi.fn() as never

import { ChatPanel } from '@/components/cfo/chat-panel'

/** Resposta longa ou errada do consultor não tinha como ser interrompida. */
describe('ChatPanel — parar resposta', () => {
  it('durante a resposta, o botão vira "Parar" e interrompe', () => {
    isStreaming = true
    render(<ChatPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Parar resposta' }))
    expect(stop).toHaveBeenCalled()
  })

  it('fora da resposta, o botão é Enviar', () => {
    isStreaming = false
    render(<ChatPanel />)
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Parar resposta' })).toBeNull()
  })
})
