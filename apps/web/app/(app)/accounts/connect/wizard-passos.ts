import { TIPOS_COMPATIVEIS, type TipoDeRecurso } from '@/lib/openfinance/auto-vinculo'
import type {
  DestinoEscolhido,
  ResultadoDaConexaoGuiada,
} from '@/lib/openfinance/conexao-guiada-actions'

/** Valor do seletor de destino que significa "criar conta nova". */
export const NOVA = '__new__'

export interface ContaDoFloow {
  id: string
  name: string
  type: string
}

export interface EstadoDoWizard {
  products: string[]
  /** '' (nada escolhido), NOVA, ou o id da conta existente. */
  destinoConta: string
  nomeConta: string
  destinoCartao: string
  nomeCartao: string
  institutionId: string
  cpf: string
}

export function contasCompativeis<T extends ContaDoFloow>(contas: T[], tipo: TipoDeRecurso): T[] {
  return contas.filter((c) => TIPOS_COMPATIVEIS[tipo].includes(c.type))
}

/**
 * Contas que ainda podem receber uma conta do banco: fora as que já espelham
 * recurso de conexão viva. `vivas` são as conexões não revogadas (é o que
 * getBankConnections devolve) — vínculo de conexão encerrada não prende a conta.
 */
export function contasDisponiveis<T extends { id: string }>(
  contas: T[],
  vivas: { resources: { accountId: string | null }[] }[],
): T[] {
  const ocupadas = new Set(vivas.flatMap((c) => c.resources.map((r) => r.accountId)))
  return contas.filter((c) => !ocupadas.has(c.id))
}

/**
 * Sem conta compatível, "criar nova" é a única resposta. Com contas, a escolha
 * fica em branco de propósito: pré-selecionar uma delas seria chutar, e chutar
 * a conta errada mistura dois históricos.
 */
export function escolhaInicial(compativeis: { id: string }[]): string {
  return compativeis.length === 0 ? NOVA : ''
}

/** O que falta para avançar do passo; null quando pode. */
export function erroDoPasso(passo: 1 | 2, e: EstadoDoWizard): string | null {
  if (passo === 1) {
    if (e.products.length === 0) return 'Marque ao menos uma opção para conectar.'
    if (e.products.includes('ACCOUNT') && !e.destinoConta) {
      return 'Escolha para onde vai a conta corrente.'
    }
    if (e.products.includes('CREDIT_CARD_ACCOUNT') && !e.destinoCartao) {
      return 'Escolha para onde vai o cartão.'
    }
    return null
  }
  if (!e.institutionId) return 'Escolha o banco.'
  // A conta dos dígitos verificadores fica no servidor; aqui só o formato.
  if (e.cpf.replace(/\D/g, '').length !== 11) return 'Informe o CPF do titular (11 dígitos).'
  return null
}

function destino(marcado: boolean, escolha: string, nome: string): DestinoEscolhido | null {
  if (!marcado || !escolha) return null
  return escolha === NOVA ? { kind: 'new', name: nome.trim() } : { kind: 'existing', accountId: escolha }
}

export function montarDestinos(e: EstadoDoWizard) {
  return {
    conta: destino(e.products.includes('ACCOUNT'), e.destinoConta, e.nomeConta),
    cartao: destino(e.products.includes('CREDIT_CARD_ACCOUNT'), e.destinoCartao, e.nomeCartao),
  }
}

const NOME_DO_TIPO: Record<TipoDeRecurso, string> = {
  ACCOUNT: 'conta corrente',
  CREDIT_CARD_ACCOUNT: 'cartão',
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

export interface ResumoDaConclusao {
  texto: string
  /** O que ficou para a tela da conexão; null quando nada. */
  pendencia: string | null
  erro: string | null
}

type Conclusao = Pick<
  ResultadoDaConexaoGuiada,
  'etapa' | 'vinculados' | 'ambiguos' | 'faltando' | 'importadas' | 'erro'
> & { atualizacao?: { status: string } }

/** Status do consentimento que não mudam mais sozinhos: esperar não adianta. */
const SEM_VOLTA = new Set(['REJECTED', 'EXPIRED'])

/** A volta para a aba ainda tem algo a buscar? */
export function continuaEsperando(r: Conclusao | null): boolean {
  if (!r) return true
  if (r.atualizacao && SEM_VOLTA.has(r.atualizacao.status)) return false
  return r.etapa === 'aguardando-autorizacao' || r.etapa === 'aguardando-contas'
}

/** O que dizer na tela depois de concluirConexaoGuiada. */
export function resumoDaConclusao(r: Conclusao): ResumoDaConclusao {
  if (r.atualizacao && SEM_VOLTA.has(r.atualizacao.status)) {
    return {
      texto: 'A autorização não foi concluída no banco.',
      pendencia: null,
      erro: 'O banco recusou ou o link expirou. Use "Reabrir autorização" na lista de conexões abaixo e conclua o passo no banco em seguida.',
    }
  }
  if (r.etapa === 'aguardando-contas') {
    return {
      texto:
        'Autorização concluída. O banco ainda está enviando as contas — assim que chegarem, o floow vincula e importa sozinho. Volte a esta aba em alguns minutos.',
      pendencia: null,
      erro: null,
    }
  }
  if (r.etapa !== 'concluida') {
    return { texto: 'Conexão pronta. Ela aparece na lista abaixo.', pendencia: null, erro: null }
  }

  const vinculadas = plural(r.vinculados, 'conta vinculada', 'contas vinculadas')
  const importadas =
    r.importadas === null ? '' : ` e ${plural(r.importadas, 'lançamento importado', 'lançamentos importados')}`

  let pendencia: string | null = null
  if (r.ambiguos.length > 0) {
    pendencia = 'O banco trouxe mais de uma conta/cartão — escolha qual vai para onde.'
  } else if (r.faltando.length > 0) {
    const tipos = [...new Set(r.faltando)].map((t) => NOME_DO_TIPO[t]).join(' e ')
    pendencia = `Falta vincular: ${tipos}. Contas liberadas depois pelo banco aparecem na tela da conexão.`
  }

  // Só investimentos: nada a vincular, a notícia é a importação.
  if (r.vinculados === 0 && !pendencia) {
    return { texto: 'Pronto: primeira importação feita.', pendencia, erro: r.erro }
  }

  return { texto: `Pronto: ${vinculadas}${importadas}.`, pendencia, erro: r.erro }
}
