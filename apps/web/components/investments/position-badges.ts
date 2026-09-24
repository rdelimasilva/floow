import type { EnrichedPosition } from '@/lib/investments/queries'

/** Selos da linha de posição. Função pura para o texto não se espalhar pela tabela. */
export function positionBadges(p: Pick<EnrichedPosition, 'source' | 'costIsPartial'>): Array<{ label: string; title: string }> {
  if (p.source !== 'openfinance') return []
  const badges = [{ label: 'Open Finance', title: 'Posição informada pelo banco. Atualizada a cada sincronização; edite no banco, não aqui.' }]
  if (p.costIsPartial) {
    badges.push({
      label: 'Custo parcial',
      title: 'O banco não informou o preço de compra e o histórico do Open Finance cobre só os últimos 12 meses. O custo soma apenas as aplicações conhecidas.',
    })
  }
  return badges
}
