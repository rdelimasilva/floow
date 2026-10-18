import { getDb, patrimonySnapshots } from '@floow/db'
import { and, eq } from 'drizzle-orm'
import { getPatrimonioAtual } from './patrimonio-queries'
import type { Patrimonio } from './patrimonio'
import { revalidateSnapshotData } from './revalidate'
import { consultarValorDasContasDeInvestimento } from '@/lib/openfinance/queries'

/**
 * Grava o snapshot do patrimônio da org — o ponto do gráfico de evolução e o
 * número que o Consultor lê como patrimônio líquido.
 *
 * Recebe o `orgId` explícito: chamado pelo botão "Atualizar valores"
 * (`refreshSnapshot`, que resolve a org da sessão) e pela importação agendada,
 * que roda sem usuário.
 *
 * `snapshot_date` é um dia, e o histórico é lido por ele: dois snapshots na
 * mesma data viravam dois pontos no gráfico, e o "último" ficava ao acaso da
 * ordem do banco. Gravar de novo no mesmo dia substitui o anterior.
 */
export async function gravarSnapshotDoPatrimonio(orgId: string, patrimonio: Patrimonio) {
  const db = getDb()
  const hoje = new Date()

  const saved = await db.transaction(async (tx) => {
    await tx
      .delete(patrimonySnapshots)
      .where(and(eq(patrimonySnapshots.orgId, orgId), eq(patrimonySnapshots.snapshotDate, hoje)))

    const [row] = await tx
      .insert(patrimonySnapshots)
      .values({
        orgId,
        snapshotDate: hoje,
        netWorthCents: patrimonio.patrimonioLiquidoCents,
        liquidAssetsCents: patrimonio.ativosCents,
        liabilitiesCents: patrimonio.passivosCents,
        breakdown: JSON.stringify(Object.fromEntries(patrimonio.blocos.map((b) => [b.key, b.valorCents]))),
      })
      .returning()
    return row
  })

  revalidateSnapshotData(orgId)

  return saved
}

/**
 * Snapshot sem sessão, para o cron: mesma regra do botão (`getPatrimonioAtual`),
 * só que as posições do Open Finance são lidas direto, sem `withUserDb`.
 */
export async function gravarSnapshotDoServico(orgId: string) {
  const patrimonio = await getPatrimonioAtual(orgId, (org) => consultarValorDasContasDeInvestimento(getDb(), org))
  return gravarSnapshotDoPatrimonio(orgId, patrimonio)
}
