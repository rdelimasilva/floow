import { beforeAll, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { NatureShortcutDialog } from '@/components/openfinance/nature-shortcut-dialog'
import { ToastProvider } from '@/components/ui/toast'

/**
 * O teste que trava o Crítico 1 da revisão final.
 *
 * Este diálogo só é aberto a partir de uma linha de DESPESA, e toda despesa tem
 * `amount_cents` negativo (convenção declarada em `normalize.ts`). Enquanto
 * havia uma opção "Receita", escolhê-la gravava `type = 'income'` sem tocar no
 * valor: `sum(case when type = 'income' then amount_cents else 0 end)` passava a
 * somar um número negativo, e um pagamento de R$ 106 mil DERRUBAVA a receita do
 * mês em todo dashboard, gráfico de fluxo e pacing.
 *
 * A cerca de verdade é o enum do zod em `nature-actions.ts` — verificada em
 * `nature-actions.test.ts`. Este teste guarda a outra ponta: a opção não pode
 * voltar à tela.
 */

// A ação é um módulo `'use server'` que importa banco e `next/cache`; nada
// disso existe em jsdom, e o teste não chega a submeter nada mesmo.
vi.mock('@/lib/openfinance/nature-actions', () => ({
  createNatureRule: vi.fn(),
}))

// jsdom não implementa `showModal`/`close` de `<dialog>`. Sem estes stubs o
// efeito de abertura estoura antes de qualquer asserção.
beforeAll(() => {
  const proto = window.HTMLDialogElement.prototype
  if (typeof proto.showModal !== 'function') {
    proto.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '')
    }
  }
  if (typeof proto.close !== 'function') {
    proto.close = function (this: HTMLDialogElement) {
      this.removeAttribute('open')
    }
  }
})

const ALVO = {
  id: '22222222-2222-2222-2222-222222222222',
  accountId: '11111111-1111-1111-1111-111111111111',
  description: 'Aplicação CDB DI',
}

function renderDialog() {
  return render(
    <ToastProvider>
      <NatureShortcutDialog target={ALVO} onClose={() => {}} />
    </ToastProvider>,
  )
}

describe('NatureShortcutDialog', () => {
  it('não oferece "receita" como natureza', () => {
    const { container } = renderDialog()

    expect(screen.queryByText(/receita/i)).toBeNull()
    expect(container.querySelector('option[value="income"]')).toBeNull()
    // Com uma natureza só, não há escolha a fazer: o `select` sumiu junto.
    expect(container.querySelector('select')).toBeNull()
  })

  it('diz a verdade sobre o alcance: só este lançamento muda agora', () => {
    renderDialog()

    expect(screen.getByText(/transferência/i)).toBeTruthy()
    expect(screen.getByText(/Este lançamento passa a valer como/i)).toBeTruthy()
    // A promessa antiga era "todos os lançamentos desta conta cuja descrição
    // contenha X"; o atalho manda um id só, e a tela não pode prometer mais do
    // que a ação faz.
    expect(screen.getByText(/continuam como estão/i)).toBeTruthy()
  })
})
