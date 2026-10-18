import type { NormalizedInvestment } from '@floow/core-finance'

/**
 * Mesmo papel listado duas vezes pela instituição, com ids diferentes.
 *
 * Caso real (XP, 02/10/2026): o CRI REDE D'OR 08/2033 ganhou um segundo id
 * uma semana depois do primeiro, sem movimentação de dinheiro, e os dois
 * passaram a vir todo dia com a mesma quantidade (9), o mesmo PU de compra
 * (1020,4443610000) e o mesmo saldo — a carteira mostrava o CRI em dobro.
 *
 * O PU de compra muda a cada dia: igual até a última casa, com a mesma
 * quantidade e o mesmo saldo na mesma data, é o mesmo lote. Sem PU de compra
 * (fundo, ação) não há como distinguir de duas compras iguais — não junta.
 */
export function chaveDeDuplicata(inv: NormalizedInvestment): string | null {
  const p = inv.position
  if (!p || p.purchaseUnitPrice == null || !p.quantity) return null
  return [
    inv.kind, inv.asset.isin ?? '', inv.asset.name, inv.asset.dueDate ?? '',
    p.referenceDate, p.quantity, p.purchaseUnitPrice, p.grossCents ?? '',
  ].join('|')
}

/**
 * Tira as cópias da listagem. Fica o de menor id — o id da Polp é UUIDv7,
 * então é o mais antigo, o que já tem ativo e histórico. A escolha não
 * depende da ordem da listagem: senão cada dia zeraria um dos dois.
 */
export function separarDuplicatas(invs: NormalizedInvestment[]): {
  unicos: NormalizedInvestment[]
  duplicatas: Array<{ inv: NormalizedInvestment; de: string }>
} {
  const original = new Map<string, string>()
  for (const inv of invs) {
    const chave = chaveDeDuplicata(inv)
    if (!chave) continue
    const atual = original.get(chave)
    if (!atual || inv.polpId < atual) original.set(chave, inv.polpId)
  }
  const unicos: NormalizedInvestment[] = []
  const duplicatas: Array<{ inv: NormalizedInvestment; de: string }> = []
  for (const inv of invs) {
    const chave = chaveDeDuplicata(inv)
    const de = chave ? original.get(chave) : undefined
    if (de && de !== inv.polpId) duplicatas.push({ inv, de })
    else unicos.push(inv)
  }
  return { unicos, duplicatas }
}
