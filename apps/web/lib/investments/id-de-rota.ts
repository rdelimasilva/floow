const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Segmento de rota que pode ser id de ativo/evento. Fora disso a consulta
 * estoura no Postgres ("invalid input syntax for type uuid") e a página cai
 * na tela de erro em vez do 404.
 */
export function ehIdDeRota(segmento: string): boolean {
  return UUID_RE.test(segmento)
}
