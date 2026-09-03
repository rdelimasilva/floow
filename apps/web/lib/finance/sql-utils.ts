/**
 * Utilitários de SQL compartilhados entre server actions de finanças.
 *
 * Vive fora de `actions.ts` de propósito: aquele arquivo leva `'use server'`
 * na primeira linha, e o Next.js só aceita função assíncrona como export de
 * um módulo `'use server'` — uma função síncrona como esta quebraria o build.
 */

/**
 * Escapa os curingas do `LIKE`/`ILIKE` (`%` e `_`) num valor fornecido pelo
 * usuário antes de ele entrar num padrão `%...%`.
 *
 * Sem isto, uma descrição bancária real com `%` (`"IOF 6,38%"`,
 * `"RENDIMENTO 100% CDI"`) vira curinga dentro do padrão e o `UPDATE`
 * retroativo casa muito mais linhas do que o usuário confirmou.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/%/g, '\\%').replace(/_/g, '\\_')
}
