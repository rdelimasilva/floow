import { diagnosticar } from '@floow/core-finance'
import { getOrgId } from '@/lib/finance/queries'
import { PageHeader } from '@/components/ui/page-header'
import { TelaDeDiagnostico } from '@/components/investments/diagnostico/tela-de-diagnostico'
import { carregarContexto } from '@/lib/investments/diagnostico/carregar'
import { frescor } from '@/lib/mercado/leitura'
import { repoDrizzle } from '@/lib/mercado/repo'

interface Props {
  searchParams: Promise<{ perfil?: string }>
}

/** Data de hoje em São Paulo, aaaa-MM-dd. */
function hojeEmSaoPaulo(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
}

export default async function DiagnosticoPage({ searchParams }: Props) {
  const [orgId, params] = await Promise.all([getOrgId(), searchParams])
  const [ctx, datas] = await Promise.all([
    carregarContexto(orgId, hojeEmSaoPaulo()),
    frescor(repoDrizzle()).catch(() => ({}) as Awaited<ReturnType<typeof frescor>>),
  ])

  return (
    <div className="space-y-6">
      <PageHeader title="Diagnóstico" description="O que pede atenção na carteira, com a conta para conferir" />
      <TelaDeDiagnostico
        diagnostico={diagnosticar(ctx)}
        perfil={ctx.perfil}
        perguntarPerfil={ctx.perfil === null || params.perfil === 'alterar'}
        dadosAte={datas.bcb ?? null}
        temInvestimentos={ctx.posicoes.length > 0}
      />
    </div>
  )
}
