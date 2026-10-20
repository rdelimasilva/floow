/**
 * Quem tem os recursos do Pro. Regra pura; a leitura do banco fica em
 * `acesso-queries.ts`.
 *
 * Trial: 30 dias contados da criação da org — ou do lançamento dos limites
 * (19/10/2026), para quem já existia, para ninguém perder acesso de um dia
 * para o outro.
 */

export const LANCAMENTO_DOS_LIMITES = new Date('2026-10-19T03:00:00Z') // 00h em SP
export const DIAS_DE_TRIAL = 30
export const LIMITE_DE_CONTAS_FREE = 2

export type Recurso = 'importacao' | 'open_finance' | 'investimentos' | 'planejamento' | 'contas'

export interface AssinaturaParaAcesso {
  planTier: 'free' | 'pro'
  status: 'active' | 'canceled' | 'past_due' | 'trialing' | 'incomplete'
}

export interface Acesso {
  pro: boolean
  /** Fim do trial; null quando o Pro vem da assinatura. */
  trialAte: Date | null
  motivo: 'assinatura' | 'trial' | 'free'
}

/** past_due ainda é Pro: o Stripe tenta cobrar de novo antes de cancelar. */
const STATUS_PAGANTE = new Set<AssinaturaParaAcesso['status']>(['active', 'trialing', 'past_due'])

export function fimDoTrial(orgCriadaEm: Date): Date {
  const inicio = orgCriadaEm > LANCAMENTO_DOS_LIMITES ? orgCriadaEm : LANCAMENTO_DOS_LIMITES
  return new Date(inicio.getTime() + DIAS_DE_TRIAL * 24 * 60 * 60 * 1000)
}

export function calcularAcesso(
  assinatura: AssinaturaParaAcesso | null,
  orgCriadaEm: Date,
  agora: Date = new Date(),
): Acesso {
  if (assinatura && assinatura.planTier === 'pro' && STATUS_PAGANTE.has(assinatura.status)) {
    return { pro: true, trialAte: null, motivo: 'assinatura' }
  }
  const trialAte = fimDoTrial(orgCriadaEm)
  if (agora < trialAte) return { pro: true, trialAte, motivo: 'trial' }
  return { pro: false, trialAte, motivo: 'free' }
}

export const NOME_DO_RECURSO: Record<Recurso, string> = {
  importacao: 'Importar extratos',
  open_finance: 'Conectar banco pelo Open Finance',
  investimentos: 'Investimentos',
  planejamento: 'Planejamento',
  contas: `Mais de ${LIMITE_DE_CONTAS_FREE} contas`,
}

/** Mensagem das server actions quando o recurso é do Pro. */
export function mensagemDeUpgrade(recurso: Recurso): string {
  return `${NOME_DO_RECURSO[recurso]} faz parte do plano Pro. Assine em Plano e cobrança para continuar.`
}
