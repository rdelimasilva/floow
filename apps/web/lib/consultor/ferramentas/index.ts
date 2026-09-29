import { CHAT_TOOLS } from '@/lib/cfo/chat-tools'
import type { Ferramenta } from './tipos'
import { saldosDasContas } from './saldos-das-contas'
import { resumoDoMes } from './resumo-do-mes'
import { gastosPorCategoria } from './gastos-por-categoria'
import { buscarTransacoes } from './buscar-transacoes'
import { planoDoMes } from './plano-do-mes'

/** As ações antigas viram botão na web até a fase 2 trocar por ação pendente. */
const SUGESTOES: Ferramenta[] = CHAT_TOOLS.map((definicao) => ({ definicao, tipo: 'sugestao' as const }))

export const FERRAMENTAS: Ferramenta[] = [
  resumoDoMes,
  gastosPorCategoria,
  buscarTransacoes,
  planoDoMes,
  saldosDasContas,
  ...SUGESTOES,
]
