import { formatBRL } from '@floow/core-finance'
import { compararComOBanco } from '@/lib/finance/divergencia-com-o-banco'

export interface ContaConferida {
  accountId: string
  nome: string
  /** O saldo que derivamos: soma dos lançamentos aplicados. */
  saldoLocalCents: number
  /** O saldo que o banco informou, ou `null` se a fonte não responde saldo. */
  saldoBancoCents: number | null
  /** Quando o BANCO apurou — não quando lemos. */
  apuradoEm: Date | null
}

/**
 * Avisa quando o saldo que derivamos discorda do que o banco informa.
 *
 * Existe porque os dois discordaram em R$ 23.665,59 e nada na tela dizia:
 * a Polp reemitiu um pagamento de fatura com outro `external_id`, o dedupe por
 * id não pegou, e o usuário só descobriu três dias depois abrindo o extrato.
 *
 * Mostra o par de números, e não só "algo está errado", porque a diferença é
 * o que permite procurar o lançamento culpado. Silencioso quando bate: alarme
 * que toca sempre vira ruído e deixa de ser lido.
 */
export function BankDivergenceAlert({ divergencias }: { divergencias: ContaConferida[] }) {
  const comProblema = divergencias.filter(
    (c) => compararComOBanco({ saldoLocalCents: c.saldoLocalCents, saldoBancoCents: c.saldoBancoCents }).divergente,
  )

  if (comProblema.length === 0) return null

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
      <p className="font-semibold text-amber-900">
        {comProblema.length === 1
          ? 'Uma conta não bate com o saldo do banco'
          : `${comProblema.length} contas não batem com o saldo do banco`}
      </p>
      <p className="mt-1 text-sm text-amber-800">
        O saldo aqui é a soma dos seus lançamentos. Quando ele discorda do banco, algum lançamento
        entrou a mais, a menos, ou errado.
      </p>

      <ul className="mt-3 space-y-2">
        {comProblema.map((c) => {
          const { diferencaCents } = compararComOBanco({
            saldoLocalCents: c.saldoLocalCents,
            saldoBancoCents: c.saldoBancoCents,
          })

          return (
            <li key={c.accountId} className="rounded-lg bg-white/70 px-3 py-2 text-sm">
              <span className="font-medium text-gray-900">{c.nome}</span>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-gray-700">
                <span>
                  Aqui: <strong>{formatBRL(c.saldoLocalCents)}</strong>
                </span>
                <span>
                  No banco: <strong>{formatBRL(c.saldoBancoCents ?? 0)}</strong>
                </span>
                <span className={diferencaCents < 0 ? 'text-red-700' : 'text-amber-900'}>
                  Diferença: <strong>{formatBRL(diferencaCents)}</strong>
                </span>
              </div>
              {c.apuradoEm !== null && (
                <p className="mt-1 text-xs text-gray-500">
                  Saldo apurado pelo banco em{' '}
                  {c.apuradoEm.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                </p>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
