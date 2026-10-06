import type { AccountType } from '@/lib/finance/account-types'

/**
 * Passo a passo de quem acabou de chegar. O caminho é o Open Finance: contas,
 * cartões, investimentos e lançamentos entram pela conexão, então o guia não
 * ensina cadastro à mão de corrente e cartão, nem importação de extrato. À
 * mão fica só o que o banco não informa, como dinheiro em espécie.
 *
 * O estado vem dos dados (conexão autorizada, conta, lançamento) e não de um
 * "marcar como feito". Só o "pular" fica com o usuário, porque "só uso um
 * banco" não aparece nos dados.
 */
export type PassoId = 'banco' | 'outros-bancos' | 'fora-do-banco' | 'lancamentos'
export type Situacao = 'feito' | 'pulado' | 'pendente'

export interface EstadoDoCadastro {
  tiposDeConta: AccountType[]
  /** Instituições distintas com consentimento autorizado. */
  bancosConectados: number
  temLancamento: boolean
  pulados: string[]
}

export interface Passo {
  id: PassoId
  titulo: string
  explicacao: string
  dicas: string[]
  acao: { rotulo: string; href: string }
  /** Rótulo do botão de pular; ausente = passo obrigatório. */
  pular?: string
  situacao: Situacao
}

export function hrefDeNovaConta(tipo: AccountType) {
  return `/accounts/new?tipo=${tipo}&volta=guia`
}

type Definicao = Omit<Passo, 'situacao'> & { feito: (e: EstadoDoCadastro) => boolean }

const DEFINICOES: Definicao[] = [
  {
    id: 'banco',
    titulo: 'Conecte seu banco principal',
    explicacao:
      'Pelo Open Finance, contas, cartões, investimentos e lançamentos entram sozinhos e continuam atualizados. Você não digita nada.',
    dicas: [
      'Escolha o banco, informe o CPF e autorize no app do próprio banco.',
      'O acesso é só de leitura: o floow não movimenta dinheiro.',
    ],
    acao: { rotulo: 'Conectar banco', href: '/accounts/connect' },
    feito: (e) => e.bancosConectados > 0,
  },
  {
    id: 'outros-bancos',
    titulo: 'Conecte os outros bancos e cartões',
    explicacao:
      'Cada instituição é uma conexão. Conta, cartão ou investimento em outro banco só aparece se ele também for conectado.',
    dicas: [
      'Pense em todos: conta salário, cartão de outro banco, corretora.',
      'Quanto mais completo, mais certo fica o saldo e o fluxo de caixa.',
    ],
    acao: { rotulo: 'Conectar outro banco', href: '/accounts/connect' },
    pular: 'Só uso um banco',
    feito: (e) => e.bancosConectados > 1,
  },
  {
    id: 'fora-do-banco',
    titulo: 'Cadastre o que fica fora do banco',
    explicacao: 'O Open Finance só traz o que está em instituição financeira. O resto você cadastra à mão.',
    dicas: [
      'Dinheiro em espécie, como a carteira ou um cofre em casa.',
      'Informe o valor de hoje; a partir daí você lança as saídas.',
    ],
    acao: { rotulo: 'Cadastrar dinheiro', href: hrefDeNovaConta('cash') },
    pular: 'Não tenho',
    feito: (e) => e.tiposDeConta.includes('cash'),
  },
  {
    id: 'lancamentos',
    titulo: 'Confira seus lançamentos',
    explicacao:
      'Depois da conexão, os lançamentos chegam sozinhos. A primeira sincronização pode levar alguns minutos.',
    dicas: [
      'Revise as categorias sugeridas e corrija o que vier errado.',
      'O que aparecer como repetido ou sem par vai para a tela Conciliar.',
    ],
    acao: { rotulo: 'Ver lançamentos', href: '/transactions' },
    feito: (e) => e.temLancamento,
  },
]

export function passosDoCadastro(estado: EstadoDoCadastro): Passo[] {
  return DEFINICOES.map(({ feito, ...passo }) => ({
    ...passo,
    situacao: feito(estado) ? 'feito' : passo.pular && estado.pulados.includes(passo.id) ? 'pulado' : 'pendente',
  }))
}

export function resumoDoCadastro(passos: Passo[]) {
  const concluidos = passos.filter((p) => p.situacao !== 'pendente').length
  return {
    concluidos,
    total: passos.length,
    atual: passos.find((p) => p.situacao === 'pendente')?.id ?? null,
    terminou: concluidos === passos.length,
  }
}

/** Chave do localStorage com os passos pulados. */
export const CHAVE_PULADOS = 'floow:primeiros-passos-pulados'
