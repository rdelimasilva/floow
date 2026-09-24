import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// O cron da Vercel dispara com GET. Rota que só exporta POST responde 405 e
// não executa nada — foi assim que o run-daily ficou parado desde a saída do
// Netlify (que chamava com POST) sem nenhum erro aparecer.
const repoRoot = resolve(__dirname, '../../../..')
const vercel = JSON.parse(readFileSync(resolve(repoRoot, 'vercel.json'), 'utf8')) as {
  crons: { path: string }[]
}

describe('rotas agendadas no vercel.json', () => {
  it.each(vercel.crons.map((c) => c.path))('%s aceita GET', (path) => {
    const source = readFileSync(resolve(repoRoot, 'apps/web/app', `.${path}`, 'route.ts'), 'utf8')
    expect(source).toMatch(/export\s+(async\s+function\s+GET\b|\{[^}]*\bas\s+GET\b[^}]*\})/)
  })
})
