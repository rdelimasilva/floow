import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const sql = readFileSync(
  resolve(__dirname, '../../../../supabase/migrations/00058_category_suggestions.sql'),
  'utf8',
)

describe('migration 00058 category_suggestions', () => {
  it('uma sugestão por fingerprint por org', () => {
    expect(sql).toMatch(/UNIQUE\s*\(\s*org_id\s*,\s*fingerprint\s*\)/)
  })
  it('RLS ligado com as quatro políticas por get_user_org_ids', () => {
    expect(sql).toMatch(/ALTER TABLE public\.category_suggestions ENABLE ROW LEVEL SECURITY/)
    for (const op of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
      expect(sql).toMatch(new RegExp(`FOR ${op} TO authenticated`))
    }
    expect(sql.match(/get_user_org_ids\(\)/g)?.length).toBeGreaterThanOrEqual(5)
  })
})

describe('migration 00059 target_category_id', () => {
  const sql59 = readFileSync(
    resolve(__dirname, '../../../../supabase/migrations/00059_sugestao_para_categoria_existente.sql'),
    'utf8',
  )
  it('adiciona a coluna de destino, idempotente, apagando junto com a categoria', () => {
    expect(sql59).toMatch(/ADD COLUMN IF NOT EXISTS target_category_id uuid/)
    expect(sql59).toMatch(/REFERENCES public\.categories\(id\) ON DELETE CASCADE/)
  })
})
