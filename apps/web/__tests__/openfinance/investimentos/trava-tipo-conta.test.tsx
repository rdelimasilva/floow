import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import React from 'react'
import type { Account } from '@floow/db'

/**
 * A conta "Investimentos · <banco>" é `brokerage` de propósito: fora do
 * patrimônio e dos seletores. Virar conta corrente faria o dinheiro das
 * aplicações contar duas vezes. O banco barra a troca; a tela nem oferece.
 */

vi.mock('@/lib/finance/account-actions', () => ({
  updateAccount: vi.fn(), deleteAccount: vi.fn(), adjustAccountBalance: vi.fn(),
}))
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ toast: vi.fn() }) }))

const { AccountCard } = await import('@/components/finance/account-card')

const SQL = readFileSync(
  join(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations', '00055_trava_tipo_conta_investimentos.sql'),
  'utf8',
).toLowerCase()

const conta = {
  id: 'conta-inv', orgId: 'org-a', name: 'Investimentos · Banco X', type: 'brokerage',
  balanceCents: 0, currency: 'BRL', branch: null, accountNumber: null,
} as unknown as Account

describe('migration 00055', () => {
  it('trigger BEFORE UPDATE em accounts barra troca de tipo da conta de investimentos', () => {
    expect(SQL).toMatch(/create or replace function/)
    expect(SQL).toMatch(/drop trigger if exists/)
    expect(SQL).toMatch(/before update on public\.accounts/)
    expect(SQL).toMatch(/new\.type is distinct from old\.type/)
    expect(SQL).toMatch(/investment_account_id = old\.id/)
    expect(SQL).toContain('a conta de investimentos do open finance não pode mudar de tipo.')
  })

  it('normaliza para brokerage a conta de investimentos que já mudou de tipo, antes do trigger', () => {
    const normaliza = SQL.search(/update public\.accounts\s+set type = 'brokerage'/)
    expect(normaliza).toBeGreaterThan(-1)
    expect(SQL).toMatch(/select investment_account_id from public\.openfinance_connections\s+where investment_account_id is not null/)
    expect(SQL).toMatch(/and type <> 'brokerage'/)
    expect(normaliza).toBeLessThan(SQL.indexOf('create trigger'))
  })

  it('o trigger só dispara quando o tipo muda (saldo e nome passam direto)', () => {
    expect(SQL).toMatch(/for each row\s+when \(old\.type is distinct from new\.type\)\s+execute function/)
  })
})

describe('AccountCard', () => {
  it('conta de investimentos do Open Finance: edição sem seletor de tipo', () => {
    render(<AccountCard account={conta} tipoTravado />)
    fireEvent.click(screen.getAllByRole('button')[0])
    expect(screen.queryByText('Tipo')).toBeNull()
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.getByText(/não pode mudar de tipo/)).toBeDefined()
  })

  it('conta comum continua com o seletor de tipo', () => {
    render(<AccountCard account={{ ...conta, type: 'checking' } as Account} />)
    fireEvent.click(screen.getAllByRole('button')[0])
    expect(screen.getByRole('combobox')).toBeDefined()
  })
})
