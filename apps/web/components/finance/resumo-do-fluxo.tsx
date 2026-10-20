import type { ResumoDoFluxo } from '@floow/core-finance/src/fluxo-resumo'
import { brl } from '@floow/core-finance/src/cfo/formato'
import { Card } from '@/components/ui/card'

function nomeDoMes(mes: string): string {
  const [y, m] = mes.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('pt-BR', { month: 'long', timeZone: 'UTC' })
}

/** Abaixo de R$ 50 ou de 5% da referência, a diferença não aparece. */
function irrelevante(diferenca: number, referencia: number): boolean {
  return Math.abs(diferenca) < Math.max(50_00, Math.abs(referencia) * 0.05)
}

function causa({ item, impacto }: { item: string; impacto: number }): string {
  // Receita acima do normal ajuda; gasto acima do normal atrapalha.
  const acima = item === 'Receitas' ? impacto > 0 : impacto < 0
  return `${item} (${brl(Math.abs(impacto))} ${acima ? 'acima' : 'abaixo'} do normal)`
}

export function ResumoDoFluxoCard({ resumo }: { resumo: ResumoDoFluxo }) {
  const mes = nomeDoMes(resumo.mes)
  const { sobra, mediaSobra, mesesNaMedia } = resumo
  const diferenca = mediaSobra === null ? 0 : sobra - mediaSobra
  const comMedia = mediaSobra !== null && !irrelevante(diferenca, mediaSobra)
  const maiorCategoria = resumo.categorias[0]?.cents ?? 0

  return (
    <Card className="p-5 space-y-5">
      <div className="space-y-1.5">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Como fechou {mes}</p>
        <p className={`text-xl font-bold ${sobra >= 0 ? 'text-green-700' : 'text-red-600'}`}>
          {sobra >= 0 ? `Sobraram ${brl(sobra)}` : `Faltaram ${brl(-sobra)}`}
        </p>
        <p className="text-sm text-gray-600">
          Entraram {brl(resumo.receita)} e saíram {brl(resumo.despesa)}.
          {mediaSobra !== null && (
            comMedia
              ? ` São ${brl(Math.abs(diferenca))} ${diferenca > 0 ? 'a mais' : 'a menos'} que a média ${mesesNaMedia === 1 ? 'do mês anterior' : `dos ${mesesNaMedia} meses anteriores`} (${brl(mediaSobra)}).`
              : ` Ficou perto da média ${mesesNaMedia === 1 ? 'do mês anterior' : `dos ${mesesNaMedia} meses anteriores`} (${brl(mediaSobra)}).`
          )}
        </p>
        {comMedia && resumo.explicam.length > 0 && (
          <p className="text-sm text-gray-600">
            {diferenca < 0 ? 'O que mais pesou: ' : 'O que mais ajudou: '}
            {resumo.explicam.map(causa).join(' e ')}.
          </p>
        )}
      </div>

      {resumo.categorias.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Para onde foi o dinheiro em {mes}
          </p>
          <ul className="space-y-2">
            {resumo.categorias.map((c) => (
              <li key={c.categoria} className="space-y-1">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate text-gray-800">{c.categoria}</span>
                  <span className="shrink-0 tabular-nums">
                    <span className="font-medium text-gray-900">{brl(c.cents)}</span>
                    {mediaSobra !== null && !irrelevante(c.variacao, c.media) && (
                      <span className={`ml-2 text-xs ${c.variacao > 0 ? 'text-red-600' : 'text-green-700'}`}>
                        {c.variacao > 0 ? '+' : '−'}{brl(Math.abs(c.variacao))} vs média
                      </span>
                    )}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-gray-100">
                  <div
                    className="h-1.5 rounded-full bg-red-400"
                    style={{ width: `${maiorCategoria ? Math.round((c.cents / maiorCategoria) * 100) : 0}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}
