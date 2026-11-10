import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Sem maxDuration, o Hobby sem fluid compute corta em 10 s; 60 s é o teto
// que já passa no deploy (cfo/chat e webhooks/whatsapp declaram o mesmo).
// Lê o fonte em vez de importar: importar a rota leva segundos com a suíte cheia.
describe('rotas de mercado', () => {
  it.each(['mercado-bcb', 'mercado-cvm-cotas', 'mercado-cvm-extrato', 'mercado-tesouro', 'mercado-b3'])('%s declara maxDuration de 60 s', (rota) => {
    const fonte = readFileSync(join(__dirname, '..', '..', 'app', 'api', 'cron', rota, 'route.ts'), 'utf8')
    expect(fonte).toMatch(/^export const maxDuration = 60$/m)
  })
})
