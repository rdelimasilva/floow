import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { contarItensParaConciliar } from '@/lib/finance/itens-para-conciliar'

/** "Conciliar (4)": o total no próprio botão, para ninguém abrir a tela à toa. */
export function BotaoConciliar({ total }: { total: number }) {
  return (
    <Button asChild variant="outline">
      <Link href="/transactions/conciliar">{total > 0 ? `Conciliar (${total})` : 'Conciliar'}</Link>
    </Button>
  )
}

/**
 * O botão com a contagem, para entrar num `<Suspense>` cujo fallback é o botão
 * sem número: o cabeçalho não espera as três contagens para aparecer. A faixa
 * pergunta o mesmo total no mesmo request, e o `cache` de
 * `contarItensParaConciliar` evita consultar duas vezes.
 */
export async function BotaoConciliarSlot({ orgId, userId }: { orgId: string; userId: string | null }) {
  const { total } = await contarItensParaConciliar(orgId, userId)
  return <BotaoConciliar total={total} />
}
