import Link from 'next/link'
import type { Diagnostico, Perfil } from '@floow/core-finance'
import { Button } from '@/components/ui/button'
import { CartaoDeImpacto } from './cartao-de-impacto'
import { ListaDeAchados } from './lista-de-achados'
import { PerguntaDePerfil } from './pergunta-de-perfil'

interface Props {
  diagnostico: Diagnostico
  perfil: Perfil | null
  /** Mostra a pergunta: perfil ainda sem resposta ou pedido de troca. */
  perguntarPerfil: boolean
  /** aaaa-MM-dd do último dado bom do BCB. */
  dadosAte: string | null
  temInvestimentos: boolean
}

const ddmm = (data: string) => `${data.slice(8, 10)}/${data.slice(5, 7)}`

export function TelaDeDiagnostico({ diagnostico, perfil, perguntarPerfil, dadosAte, temInvestimentos }: Props) {
  if (!temInvestimentos) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-12 text-center">
        <h3 className="text-sm font-medium text-gray-900">Nenhum ativo cadastrado</h3>
        <p className="mt-1 text-sm text-gray-500">Comece registrando seus ativos e eventos de portfólio.</p>
        <div className="mt-6">
          <Button asChild variant="primary">
            <Link href="/investments/new">Novo Ativo</Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {perguntarPerfil && <PerguntaDePerfil atual={perfil} />}
      <CartaoDeImpacto diagnostico={diagnostico} />
      <ListaDeAchados achados={diagnostico.achados} />
      <footer className="space-y-1 text-xs text-gray-500">
        <p>
          {dadosAte && <>Dados de mercado até {ddmm(dadosAte)} · </>}
          {perfil ? <>Perfil: {perfil} · </> : null}
          <Link href="/investments/diagnostico?perfil=alterar" className="underline hover:text-gray-700">
            {perfil ? 'alterar' : 'responder perfil'}
          </Link>
        </p>
        <p>Análise educacional. Não constitui recomendação de investimento (Res. CVM 19/2021).</p>
      </footer>
    </div>
  )
}
