// scripts/mercado-carga-inicial.mts
//
// Primeira carga dos dados de mercado: 12 meses de BCB e de cotas da CVM, o
// extrato dos fundos, o histórico inteiro do Tesouro e os 3 meses de cotação
// que a brapi grátis devolve por ticker. Depois disso os crons diários só
// completam.
//
// Grava no banco de DATABASE_URL, e o apps/web/.env.local aponta para o de
// produção. Só rode com autorização.
//
//   npx tsx --tsconfig apps/web/tsconfig.json scripts/mercado-carga-inicial.mts [--so=bcb|cvm_cotas|cvm_extrato|tesouro|b3]
//
// Upsert pela chave em tudo: rodar de novo não duplica.
import { readFileSync } from 'node:fs'
import { databaseUrl } from './conciliacao-comum.mts'

const ARGS = process.argv.slice(2)
if (ARGS.includes('--help')) {
  console.log('uso: npx tsx --tsconfig apps/web/tsconfig.json scripts/mercado-carga-inicial.mts [--so=<job>]')
  console.log('jobs: bcb, cvm_cotas, cvm_extrato, tesouro, b3')
  process.exit(0)
}

function brapiToken(): string | undefined {
  if (process.env.BRAPI_TOKEN) return process.env.BRAPI_TOKEN
  const texto = readFileSync(new URL('../apps/web/.env.local', import.meta.url), 'utf8')
  return texto.split(/\r?\n/).find((l) => l.startsWith('BRAPI_TOKEN='))?.slice('BRAPI_TOKEN='.length).trim()
}

process.env.DATABASE_URL = databaseUrl()

const { repoDrizzle, universoDeMercado } = await import('../apps/web/lib/mercado/repo.ts')
const { rodarBcb } = await import('../apps/web/lib/mercado/jobs/bcb.ts')
const { rodarCvmCotas } = await import('../apps/web/lib/mercado/jobs/cvm-cotas.ts')
const { rodarCvmExtrato } = await import('../apps/web/lib/mercado/jobs/cvm-extrato.ts')
const { rodarTesouro } = await import('../apps/web/lib/mercado/jobs/tesouro.ts')
const { buscarHistorico } = await import('../apps/web/lib/mercado/brapi.ts')

const so = ARGS.find((a) => a.startsWith('--so='))?.slice('--so='.length)
const roda = (job: string) => !so || so === job

const repo = repoDrizzle()
const hoje = new Date()
const { cnpjs, tickers } = await universoDeMercado()
console.log(`universo: ${cnpjs.size} fundos com CNPJ, ${tickers.length} tickers`)

if (roda('bcb')) console.log('bcb', await rodarBcb({ fetch, repo, hoje, janelaDias: 400 }))

// O extrato vem antes das cotas: ele grava o de-para fundo → classe que as cotas usam.
if (roda('cvm_extrato')) console.log('cvm_extrato', await rodarCvmExtrato({ fetch, repo, hoje, cnpjs }))

if (roda('cvm_cotas')) {
  for (let i = 12; i >= 0; i--) {
    const d = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - i, 1))
    const mes = d.toISOString().slice(0, 7).replace('-', '')
    console.log('cvm_cotas', mes, await rodarCvmCotas({ fetch, repo, hoje, cnpjs, meses: [mes] }))
  }
}

if (roda('tesouro')) console.log('tesouro', await rodarTesouro({ fetch, repo }))

if (roda('b3')) {
  const token = brapiToken()
  if (!token) throw new Error('BRAPI_TOKEN ausente')
  let gravadas = 0
  for (const t of tickers) {
    const r = await buscarHistorico(t, { fetch, token })
    if (r.tipo === 'limite') {
      console.log('b3: limite da brapi, parei em', t)
      break
    }
    if (r.tipo === 'ok') gravadas += await repo.gravarFechamentos(r.linhas)
    else console.log('b3: sem dado para', t)
  }
  console.log('b3', { linhas: gravadas })
}

process.exit(0)
