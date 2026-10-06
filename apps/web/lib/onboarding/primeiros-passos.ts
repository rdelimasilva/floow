import type { AccountType } from '@/lib/finance/account-types'

/**
 * Passo a passo de quem acabou de chegar: cadastrar as contas e começar a
 * lançar. O estado vem dos dados (tipo de conta existe, há conexão, há
 * lançamento) e não de um "marcar como feito": quem cadastra o cartão pela
 * tela de Contas, sem passar pelo guia, também vê o passo concluído.
 *
 * Só o "pular" fica com o usuário, porque "não tenho cartão" não aparece nos
 * dados.
 */
export type PassoId = 'banco' | 'corrente' | 'cartao' | 'reservas' | 'lancamentos'
export type Situacao = 'feito' | 'pulado' | 'pendente'

export interface EstadoDoCadastro {
  tiposDeConta: AccountType[]
  temConexao: boolean
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

const tem = (e: EstadoDoCadastro, ...tipos: AccountType[]) => e.tiposDeConta.some((t) => tipos.includes(t))

const DEFINICOES: Definicao[] = [
  {
    id: 'banco',
    titulo: 'Conecte seu banco',
    explicacao:
      'Pelo Open Finance, contas, cartões e lançamentos entram sozinhos e continuam atualizados. É o caminho mais rápido.',
    dicas: [
      'Você escolhe o banco, informa o CPF e autoriza no app do próprio banco.',
      'O acesso é só de leitura: o floow não movimenta dinheiro.',
      'As contas que vierem do banco já contam nos próximos passos.',
    ],
    acao: { rotulo: 'Conectar banco', href: '/accounts/connect' },
    pular: 'Prefiro cadastrar à mão',
    feito: (e) => e.temConexao,
  },
  {
    id: 'corrente',
    titulo: 'Cadastre sua conta corrente',
    explicacao: 'É por ela que passa o dia a dia: salário, contas pagas, transferências.',
    dicas: [
      'Use um nome que identifique o banco, como "Itaú — corrente".',
      'No saldo inicial, informe o saldo de hoje, como está no extrato.',
      'Tem mais de uma conta? Cadastre todas; o guia avança na primeira.',
    ],
    acao: { rotulo: 'Cadastrar conta corrente', href: hrefDeNovaConta('checking') },
    feito: (e) => tem(e, 'checking'),
  },
  {
    id: 'cartao',
    titulo: 'Cadastre seus cartões de crédito',
    explicacao: 'Cada cartão vira uma conta própria, com a fatura separada da conta corrente.',
    dicas: [
      'Informe o dia de fechamento e o de vencimento: é por eles que cada compra cai na fatura certa.',
      'Se já existe fatura em aberto, lance o valor como saldo negativo (ex: -1500,00).',
    ],
    acao: { rotulo: 'Cadastrar cartão', href: hrefDeNovaConta('credit_card') },
    pular: 'Não uso cartão',
    feito: (e) => tem(e, 'credit_card'),
  },
  {
    id: 'reservas',
    titulo: 'Poupança, investimentos e dinheiro',
    explicacao: 'O que está guardado também é patrimônio. Cadastrar aqui completa a visão do quanto você tem.',
    dicas: [
      'Poupança e dinheiro em espécie ficam junto das contas correntes.',
      'Investimento (CDB, corretora, previdência) fica num bloco próprio.',
      'Basta o saldo atual; o rendimento você ajusta depois.',
    ],
    acao: { rotulo: 'Cadastrar reserva', href: hrefDeNovaConta('savings') },
    pular: 'Não tenho por agora',
    feito: (e) => tem(e, 'savings', 'brokerage', 'cash'),
  },
  {
    id: 'lancamentos',
    titulo: 'Registre seus lançamentos',
    explicacao: 'Com as contas prontas, falta o movimento: o que entrou e o que saiu.',
    dicas: [
      'Importe o extrato (OFX ou CSV) do banco para não digitar um a um.',
      'Ou lance à mão as despesas do mês; o dashboard se atualiza na hora.',
    ],
    acao: { rotulo: 'Ir para lançamentos', href: '/transactions' },
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
