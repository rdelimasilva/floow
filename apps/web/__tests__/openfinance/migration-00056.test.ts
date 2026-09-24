import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SQL = readFileSync(
  join(__dirname, '..', '..', '..', '..', 'supabase', 'migrations', '00056_destino_da_conexao_guiada.sql'),
  'utf8',
).toLowerCase()

describe('migration 00056', () => {
  it('colunas novas, idempotentes', () => {
    for (const c of ['target_account_id', 'target_card_account_id', 'target_account_new_name', 'target_card_new_name', 'auto_link_done_at']) {
      expect(SQL).toContain(`add column if not exists ${c}`)
    }
  })

  it('conexões que já existiam ficam marcadas como concluídas (fluxo antigo, sem importação surpresa)', () => {
    // Sem isto, toda conexão antiga com INVESTMENTS rodaria uma importação
    // automática ao abrir a tela — a jornada nova só vale para conexão nova.
    expect(SQL).toMatch(
      /update public\.openfinance_connections\s+set auto_link_done_at = created_at\s+where auto_link_done_at is null/,
    )
    expect(SQL).toMatch(/target_account_id is null\s+and target_card_account_id is null/)
    expect(SQL).toMatch(/target_account_new_name is null\s+and target_card_new_name is null/)
  })
})
