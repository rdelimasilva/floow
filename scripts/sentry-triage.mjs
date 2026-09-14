#!/usr/bin/env node
/**
 * Busca issues do Sentry e mantém o ledger de triagem.
 *
 * A parte MECÂNICA da automação: paginar a API, extrair os frames do app,
 * lembrar o que já foi julgado. O julgamento em si é do agente, na skill
 * `.claude/skills/sentry-autofix/SKILL.md`.
 *
 * O ledger existe porque sem ele a rotina re-analisa as mesmas issues todo
 * dia. A chave é o par (id, lastSeen): issue já julgada que voltou a disparar
 * tem `lastSeen` novo e volta para a fila; issue parada some da fila.
 *
 * Uso:
 *   node scripts/sentry-triage.mjs fetch [--all] [--days 90]
 *   node scripts/sentry-triage.mjs record --id <issueId> --verdict <v> --note "<texto>"
 *
 * Vereditos: morto | nao-e-nosso | guard-intencional | vivo-corrigido |
 *            vivo-reportado | ignorado
 *
 * NUNCA imprime o token.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const LEDGER_PATH = resolve(ROOT, '.claude/sentry-ledger.json')
const ENV_PATH = resolve(ROOT, 'apps/web/.env.local')

const VERDICTS = new Set([
  'morto',
  'nao-e-nosso',
  'guard-intencional',
  'vivo-corrigido',
  'vivo-reportado',
  'ignorado',
])

function loadEnv() {
  const fromProcess = {
    SENTRY_ORG: process.env.SENTRY_ORG,
    SENTRY_PROJECT: process.env.SENTRY_PROJECT,
    SENTRY_AUTH_TOKEN: process.env.SENTRY_AUTH_TOKEN,
  }
  if (fromProcess.SENTRY_ORG && fromProcess.SENTRY_AUTH_TOKEN) return fromProcess

  if (!existsSync(ENV_PATH)) {
    fail(`sem SENTRY_* no ambiente e ${ENV_PATH} não existe`)
  }
  const parsed = {}
  for (const line of readFileSync(ENV_PATH, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/)
    if (m) parsed[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  return { ...parsed, ...Object.fromEntries(Object.entries(fromProcess).filter(([, v]) => v)) }
}

class TriageError extends Error {}

/**
 * Lança em vez de `process.exit`: no Node 25 do Windows, sair com um fetch
 * ainda aberto dispara um assert do libuv e o código vira 127, que um
 * orquestrador lê como "comando não encontrado". Deixar a pilha desenrolar
 * preserva o exit 1.
 */
function fail(msg) {
  throw new TriageError(msg)
}

function loadLedger() {
  if (!existsSync(LEDGER_PATH)) return {}
  try {
    return JSON.parse(readFileSync(LEDGER_PATH, 'utf8'))
  } catch (e) {
    fail(`ledger corrompido em ${LEDGER_PATH}: ${e.message}`)
  }
}

function saveLedger(ledger) {
  mkdirSync(dirname(LEDGER_PATH), { recursive: true })
  writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2) + '\n', 'utf8')
}

async function api(path, token) {
  const res = await fetch(`https://sentry.io/api/0${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status === 403) {
    fail(
      'HTTP 403: o token não tem escopo de leitura. Crie um em ' +
        'https://sentry.io/settings/account/api/auth-tokens/ com `event:read` ' +
        'e `project:read`, e exporte como SENTRY_AUTH_TOKEN.'
    )
  }
  if (!res.ok) fail(`HTTP ${res.status} em ${path}: ${(await res.text()).slice(0, 200)}`)
  return { body: await res.json(), link: res.headers.get('link') ?? '' }
}

/** O Sentry pagina por cursor no header Link; `results="true"` marca se há próxima. */
function nextCursor(link) {
  const next = link.split(',').find((p) => p.includes('rel="next"'))
  if (!next || !next.includes('results="true"')) return null
  return next.match(/cursor="([^"]+)"/)?.[1] ?? null
}

/** Só frames do nosso código — os de node_modules não ajudam a decidir nada. */
function appFrames(event) {
  const entry = event?.entries?.find((e) => e.type === 'exception')
  const values = entry?.data?.values ?? []
  const frames = []
  for (const v of values) {
    for (const f of v?.stacktrace?.frames ?? []) {
      if (f.inApp && f.filename) {
        frames.push({ file: f.filename, line: f.lineNo ?? null, fn: f.function ?? null })
      }
    }
  }
  return frames.slice(-8)
}

async function cmdFetch(args) {
  const env = loadEnv()
  const org = env.SENTRY_ORG
  const project = env.SENTRY_PROJECT
  const token = env.SENTRY_AUTH_TOKEN
  if (!org || !token) fail('SENTRY_ORG e SENTRY_AUTH_TOKEN são obrigatórios')

  const days = args.days ?? '90'
  const ledger = loadLedger()
  const todas = args.all === true

  const issues = []
  let cursor = null
  do {
    const q = new URLSearchParams({
      query: 'is:unresolved',
      statsPeriod: `${days}d`,
      limit: '100',
    })
    if (project) q.set('project', project)
    if (cursor) q.set('cursor', cursor)
    const { body, link } = await api(`/organizations/${org}/issues/?${q}`, token)
    issues.push(...body)
    cursor = nextCursor(link)
  } while (cursor)

  const fila = issues.filter((i) => todas || ledger[i.id]?.lastSeen !== i.lastSeen)

  const saida = []
  for (const i of fila) {
    let frames = []
    try {
      const { body: ev } = await api(`/organizations/${org}/issues/${i.id}/events/latest/`, token)
      frames = appFrames(ev)
    } catch {
      // Evento expirado pela retenção: o resto da issue ainda decide muita coisa.
    }
    saida.push({
      id: i.id,
      shortId: i.shortId,
      titulo: i.title,
      culprit: i.culprit,
      firstSeen: i.firstSeen,
      lastSeen: i.lastSeen,
      eventos: i.count,
      usuarios: i.userCount,
      permalink: i.permalink,
      appFrames: frames,
      veredictoAnterior: ledger[i.id]?.verdict ?? null,
    })
  }

  console.log(
    JSON.stringify(
      {
        totalNoSentry: issues.length,
        jaJulgadasESemMudanca: issues.length - fila.length,
        paraTriar: saida.length,
        issues: saida,
      },
      null,
      2
    )
  )
}

function cmdRecord(args) {
  if (!args.id) fail('--id é obrigatório')
  if (!VERDICTS.has(args.verdict)) {
    fail(`--verdict inválido. Use um de: ${[...VERDICTS].join(', ')}`)
  }
  if (!args.lastSeen) fail('--lastSeen é obrigatório (copie do fetch)')

  const ledger = loadLedger()
  ledger[args.id] = {
    verdict: args.verdict,
    note: args.note ?? '',
    lastSeen: args.lastSeen,
    julgadoEm: new Date().toISOString(),
  }
  saveLedger(ledger)
  console.log(`[sentry-triage] ${args.id} -> ${args.verdict}`)
}

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const key = a.slice(2)
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) out[key] = true
    else {
      out[key] = next
      i++
    }
  }
  return out
}

const [cmd, ...rest] = process.argv.slice(2)
const args = parseArgs(rest)

try {
  if (cmd === 'fetch') await cmdFetch(args)
  else if (cmd === 'record') cmdRecord(args)
  else fail('comando desconhecido. Use `fetch` ou `record`.')
} catch (e) {
  console.error(`[sentry-triage] ${e instanceof TriageError ? e.message : e}`)
  process.exitCode = 1
}
