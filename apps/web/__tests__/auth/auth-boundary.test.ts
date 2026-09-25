import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/**
 * Guarda de fronteira de autenticação.
 *
 * Existe porque o furo que estes testes previnem não foi um erro pontual: o
 * mesmo padrão inseguro estava copiado em 11 arquivos. Uma revisão humana não
 * pega a 12ª cópia; o CI pega.
 */

const WEB_ROOT = join(__dirname, '..', '..')
const SCAN_DIRS = ['app', 'lib', 'components'].map((d) => join(WEB_ROOT, d))

function walk(dir: string): string[] {
  let out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === '.next') continue
      out = out.concat(walk(full))
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full)
    }
  }
  return out
}

const sourceFiles = SCAN_DIRS.flatMap(walk)
const rel = (f: string) => relative(WEB_ROOT, f).split(sep).join('/')

describe('fronteira de autenticação', () => {
  it('encontra arquivos para varrer (a varredura em si não pode silenciar)', () => {
    expect(sourceFiles.length).toBeGreaterThan(50)
  })

  it('nenhum arquivo usa auth.getSession() como fonte de identidade', () => {
    const offenders = sourceFiles
      .filter((f) => /auth\s*\.\s*getSession\s*\(/.test(readFileSync(f, 'utf8')))
      .map(rel)

    expect(offenders).toEqual([])
  })

  it('nenhum arquivo decodifica o payload de um JWT na mão', () => {
    const offenders = sourceFiles
      .filter((f) => /access_token\s*\.\s*split\s*\(\s*['"]\.['"]\s*\)/.test(readFileSync(f, 'utf8')))
      .map(rel)

    expect(offenders).toEqual([])
  })

  it('nenhuma rota compara segredo com template string interpolada', () => {
    const offenders = sourceFiles
      .filter((f) => /===\s*`Bearer \$\{/.test(readFileSync(f, 'utf8')))
      .map(rel)

    expect(offenders).toEqual([])
  })
})

describe('toda route handler tem guarda de autenticação', () => {
  // Rotas públicas por desenho. Cada entrada precisa de um motivo — acrescentar
  // uma linha aqui é uma decisão de segurança, e aparece no diff.
  const PUBLIC_ROUTES: Record<string, string> = {
    'app/(auth)/auth/callback/route.ts':
      'troca o code do OAuth/magic link por sessão; é o passo que autentica',
    'app/api/webhooks/stripe/route.ts':
      'autentica por assinatura HMAC do Stripe (constructEvent)',
    'app/api/email/unsubscribe/route.ts':
      'link do rodapé do e-mail, aberto sem login; autoriza por token HMAC e só desliga a própria preferência',
    'app/api/webhooks/whatsapp/route.ts':
      'autentica por assinatura HMAC da Meta (X-Hub-Signature-256); o GET só devolve o challenge com o verify token',
  }

  const AUTH_GUARDS = [
    "@/lib/auth/session",   // getVerifiedIdentity / requireIdentity / getOrgId
    "@/lib/auth/service-auth", // isAuthorizedService (cron, máquina-a-máquina)
  ]

  const routeFiles = sourceFiles.filter((f) => /(^|\/)route\.tsx?$/.test(rel(f)))

  it('existe pelo menos uma route handler para checar', () => {
    expect(routeFiles.length).toBeGreaterThan(0)
  })

  it('toda rota importa um guarda ou está na allowlist justificada', () => {
    const unguarded = routeFiles
      .filter((f) => {
        const path = rel(f)
        if (path in PUBLIC_ROUTES) return false
        const src = readFileSync(f, 'utf8')
        return !AUTH_GUARDS.some((g) => src.includes(g))
      })
      .map(rel)

    expect(unguarded).toEqual([])
  })

  it('a allowlist não guarda rota que já não existe', () => {
    const existing = new Set(routeFiles.map(rel))
    const stale = Object.keys(PUBLIC_ROUTES).filter((p) => !existing.has(p))

    expect(stale).toEqual([])
  })
})
