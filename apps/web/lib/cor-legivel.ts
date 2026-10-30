type Rgb = [number, number, number]

function lerHex(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function paraHex([r, g, b]: Rgb): string {
  return '#' + [r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')
}

function luminancia(rgb: Rgb): number {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contraste(a: Rgb, b: Rgb): number {
  const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}

/**
 * Cor de texto para o selo de categoria, que pinta o fundo com a própria cor
 * em alfa `20` (12,5%) sobre branco. Escurece a cor, misturando com preto, até
 * o texto chegar a 4,5:1 contra esse fundo. Assim o amarelo continua amarelado
 * e fica legível. Cor fora do formato #rrggbb volta como cinza-700.
 */
export function corDeTextoSobreTinta(hex: string, alfa = 0x20 / 255): string {
  const cor = lerHex(hex)
  if (!cor) return '#374151'
  const fundo = cor.map((c) => c * alfa + 255 * (1 - alfa)) as Rgb
  for (let escuro = 0; escuro <= 1; escuro += 0.05) {
    const texto = cor.map((c) => c * (1 - escuro)) as Rgb
    if (contraste(texto, fundo) >= 4.5) return paraHex(texto)
  }
  return '#000000'
}
