import { RolarParaASecao } from './rolar-para-a-secao'

/**
 * A ordem das seções é a ordem correta de decidir, a mesma da faixa de antes:
 *
 *  1. Repetido primeiro. Classificar ou confirmar um lançamento que vai ser
 *     descartado é trabalho jogado fora.
 *  2. Classificar depois, porque define o que o lançamento é.
 *  3. Confirmar previsão por último: só faz sentido contra um lançamento que
 *     já se sabe real e já se sabe o que é.
 *
 * Os títulos dizem a AÇÃO, não o jargão: "contraparte" é vocabulário de Open
 * Finance e não significa nada para quem usa o app.
 */
export const SECOES = {
  repetidos: {
    titulo: 'Remover repetidos',
    descricao: 'Lançamentos que o banco mandou duas vezes. Nada sai das somas sem você aprovar.',
  },
  classificar: {
    titulo: 'Classificar lançamentos',
    descricao:
      'Lançamentos que vieram do banco e o floow ainda não sabe classificar sozinho. Você decide uma vez e vale para os próximos.',
  },
  confirmar: {
    titulo: 'Confirmar previsões',
    descricao:
      'Previsões suas que parecem já ter acontecido, com o lançamento do banco que as cumpriu. Nada é confirmado sem você aprovar.',
  },
} as const

export type IdDaSecao = keyof typeof SECOES

export function SecaoDeConciliar({
  id,
  contagem,
  children,
}: {
  id: IdDaSecao
  contagem: number
  // Opcional só para o `createElement(SecaoDeConciliar, props, filho)` dos
  // testes tipar; toda seção de verdade passa conteúdo.
  children?: React.ReactNode
}) {
  const tituloId = `${id}-titulo`
  return (
    <section id={id} aria-labelledby={tituloId} className="scroll-mt-20 space-y-3">
      <RolarParaASecao id={id} />
      <div>
        <h2 id={tituloId} className="flex items-center gap-2 text-base font-semibold text-gray-900">
          {SECOES[id].titulo}
          {contagem > 0 && (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">{contagem}</span>
          )}
        </h2>
        <p className="mt-1 text-sm text-gray-600">{SECOES[id].descricao}</p>
      </div>
      {children}
    </section>
  )
}

/** A busca da seção falhou: as outras seguem, e esta diz o que houve. */
export function FalhaDaSecao({ id }: { id: IdDaSecao }) {
  return (
    <SecaoDeConciliar id={id} contagem={0}>
      <p role="alert" className="text-sm text-gray-600">
        Não foi possível carregar esta parte agora. Recarregue a página para tentar de novo.
      </p>
    </SecaoDeConciliar>
  )
}

export function TudoConciliado() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-6 py-10 text-center">
      <p className="text-base font-medium text-gray-900">Tudo conciliado</p>
      <p className="mt-1 text-sm text-gray-600">
        Nada esperando decisão sua. Quando o banco mandar algo que o floow não resolve sozinho, aparece aqui.
      </p>
    </div>
  )
}
