import { customType } from 'drizzle-orm/pg-core'

/**
 * `numeric` que chega ao TypeScript como `number`.
 *
 * Drizzle 0.40 devolve `numeric` como string, e trocar `quantity` de
 * `integer` para `numeric` mudaria o tipo em uma dúzia de arquivos da
 * carteira. Cota de fundo e fração de título precisam de casa decimal; um
 * `number` de 64 bits carrega 15 dígitos significativos, folga para
 * quantidade e preço unitário. Dinheiro NÃO usa isto — dinheiro é centavo
 * inteiro.
 */
export const numericNumber = customType<{ data: number; driverData: string }>({
  dataType() {
    return 'numeric(28, 10)'
  },
  fromDriver(value) {
    return Number(value)
  },
  toDriver(value) {
    return String(value)
  },
})
