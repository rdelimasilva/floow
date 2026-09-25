import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { COMMANDS, filtrarComandos } from '@/components/layout/command-palette'
import { NAV_SECTIONS } from '@/components/layout/sidebar'

/**
 * A paleta (Ctrl+K) tinha duas entradas para páginas que nunca existiram
 * (/planning/fi-calculator e /planning/withdrawal) — o usuário escolhia e caía
 * no 404. E faltavam páginas que o menu tem, como Consultor Financeiro e
 * Ritmo de Gastos.
 */
function existeAPagina(href: string) {
  return fs.existsSync(path.join(__dirname, '../../app/(app)', href.split('?')[0], 'page.tsx'))
}

describe('paleta de comandos', () => {
  it('só aponta para páginas que existem', () => {
    const quebradas = COMMANDS.map((c) => c.href).filter((h) => !existeAPagina(h))
    expect(quebradas).toEqual([])
  })

  it('tem tudo o que o menu lateral tem', () => {
    const naPaleta = new Set(COMMANDS.map((c) => c.href))
    const faltando = NAV_SECTIONS.flatMap((s) => s.items.map((i) => i.href)).filter((h) => !naPaleta.has(h))
    expect(faltando).toEqual([])
  })

  it('acha a página sem o usuário digitar acento', () => {
    const achados = filtrarComandos('transacoes').map((c) => c.label)
    expect(achados).toContain('Transações')
    expect(achados).not.toContain('Contas')
  })
})
