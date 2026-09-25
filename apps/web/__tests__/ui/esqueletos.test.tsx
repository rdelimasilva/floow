import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { EsqueletoDeFormulario, EsqueletoDeLista, EsqueletoDePainel } from '@/components/ui/esqueletos'

/**
 * 21 telas não tinham loading próprio e herdavam o esqueleto do pai: abrir
 * "Importar" mostrava uma lista de transações piscando, Configurações mostrava
 * o esqueleto genérico. Toda tela passa a ter o seu, com o formato do conteúdo.
 */
const APP = path.join(__dirname, '../../app/(app)')

function paginas(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return paginas(p)
    return e.name === 'page.tsx' ? [dir] : []
  })
}

describe('carregamento', () => {
  it('toda tela do app tem loading próprio', () => {
    const sem = paginas(APP).filter((d) => !fs.existsSync(path.join(d, 'loading.tsx'))).map((d) => path.relative(APP, d))
    expect(sem).toEqual([])
  })

  it.each([
    ['formulário', EsqueletoDeFormulario],
    ['lista', EsqueletoDeLista],
    ['painel', EsqueletoDePainel],
  ])('esqueleto de %s é anunciado como carregando', (_, Esqueleto) => {
    render(<Esqueleto />)
    expect(screen.getByRole('status').getAttribute('aria-label')).toBe('Carregando')
  })
})
