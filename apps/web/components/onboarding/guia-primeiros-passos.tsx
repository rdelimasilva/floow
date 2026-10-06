'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, ChevronDown, CircleDashed, PartyPopper } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  passosDoCadastro,
  resumoDoCadastro,
  type EstadoDoCadastro,
  type Passo,
  type PassoId,
} from '@/lib/onboarding/primeiros-passos'
import { usePassosPulados } from './use-passos-pulados'

interface Props {
  estado: Omit<EstadoDoCadastro, 'pulados'>
}

export function BarraDeProgresso({ concluidos, total }: { concluidos: number; total: number }) {
  return (
    <div>
      <p className="mb-1.5 text-xs text-gray-500">
        {concluidos} de {total} concluídos
      </p>
      <div className="h-1.5 w-full rounded-full bg-gray-200">
        <div
          className="h-1.5 rounded-full bg-blue-500 transition-all duration-500"
          style={{ width: `${(concluidos / total) * 100}%` }}
        />
      </div>
    </div>
  )
}

function Marcador({ passo, numero }: { passo: Passo; numero: number }) {
  if (passo.situacao === 'feito') return <CheckCircle2 className="h-6 w-6 shrink-0 text-green-600" aria-hidden />
  if (passo.situacao === 'pulado') return <CircleDashed className="h-6 w-6 shrink-0 text-gray-400" aria-hidden />
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-blue-300 bg-blue-50 text-xs font-semibold text-blue-700">
      {numero}
    </span>
  )
}

const ROTULO_DA_SITUACAO = { feito: 'Feito', pulado: 'Pulado', pendente: '' } as const

/**
 * Lista dos passos com o atual aberto. Os demais abrem com um clique, para
 * quem quer cadastrar fora de ordem ou rever a explicação.
 */
export function GuiaPrimeirosPassos({ estado }: Props) {
  const { pulados, pular } = usePassosPulados()
  const passos = passosDoCadastro({ ...estado, pulados })
  const resumo = resumoDoCadastro(passos)
  const [escolhido, setEscolhido] = useState<PassoId | null>(null)
  const aberto = escolhido ?? resumo.atual

  function pularPasso(id: PassoId) {
    pular(id)
    setEscolhido(null)
  }

  return (
    <div className="space-y-6">
      <BarraDeProgresso concluidos={resumo.concluidos} total={resumo.total} />

      {resumo.terminou && (
        <div className="flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 p-4">
          <PartyPopper className="mt-0.5 h-5 w-5 shrink-0 text-green-700" aria-hidden />
          <div>
            <p className="font-medium text-green-900">Tudo pronto!</p>
            <p className="mt-0.5 text-sm text-green-800">
              Suas contas estão cadastradas. Daqui para frente, o dashboard mostra para onde vai o seu dinheiro.
            </p>
            <Button asChild variant="primary" className="mt-3">
              <Link href="/dashboard">Ir para o dashboard</Link>
            </Button>
          </div>
        </div>
      )}

      <ol className="space-y-3">
        {passos.map((passo, i) => {
          const estaAberto = aberto === passo.id
          return (
            <li
              key={passo.id}
              className={`rounded-xl border bg-white ${estaAberto ? 'border-blue-300 shadow-sm' : 'border-gray-200'}`}
            >
              <button
                type="button"
                onClick={() => setEscolhido(estaAberto ? null : passo.id)}
                aria-expanded={estaAberto}
                className="flex w-full items-center gap-3 p-4 text-left"
              >
                <Marcador passo={passo} numero={i + 1} />
                <span
                  className={`flex-1 text-sm font-medium ${passo.situacao === 'pendente' ? 'text-gray-900' : 'text-gray-500'}`}
                >
                  {passo.titulo}
                </span>
                {passo.situacao !== 'pendente' && (
                  <span className="text-xs text-gray-500">{ROTULO_DA_SITUACAO[passo.situacao]}</span>
                )}
                <ChevronDown
                  className={`h-4 w-4 text-gray-400 transition-transform ${estaAberto ? 'rotate-180' : ''}`}
                  aria-hidden
                />
              </button>

              {estaAberto && (
                <div className="space-y-3 border-t border-gray-100 px-4 pb-4 pt-3 sm:pl-13">
                  <p className="text-sm text-gray-700">{passo.explicacao}</p>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-gray-600">
                    {passo.dicas.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <Button asChild variant={passo.situacao === 'feito' ? 'outline' : 'primary'}>
                      <Link href={passo.acao.href}>{passo.acao.rotulo}</Link>
                    </Button>
                    {passo.pular && passo.situacao === 'pendente' && (
                      <Button type="button" variant="ghost" onClick={() => pularPasso(passo.id)}>
                        {passo.pular}
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
