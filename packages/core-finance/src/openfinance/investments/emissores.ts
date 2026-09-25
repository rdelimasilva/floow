/**
 * Nome curto do banco emissor a partir do CNPJ.
 *
 * A renda fixa bancária (CDB, LCI, LCA...) só traz `issuer_institution_cnpj_number`
 * — o payload não tem o nome. A chave é a raiz (8 primeiros dígitos), que é a
 * mesma em todas as filiais. Só entra aqui CNPJ conferido: emissor errado na
 * tela é pior que emissor nenhum. Desconhecido devolve null e o CNPJ continua
 * guardado no ativo.
 */
const BANCO_POR_RAIZ: Record<string, string> = {
  '00000000': 'Banco do Brasil',
  '00360305': 'Caixa',
  '00416968': 'Inter',
  '01181521': 'Sicredi',
  '02038232': 'Sicoob',
  '07237373': 'Banco do Nordeste',
  '10664513': 'Agibank',
  '17184037': 'Mercantil do Brasil',
  '18236120': 'Nubank',
  '28195667': 'ABC Brasil',
  '30306294': 'BTG Pactual',
  '30680829': 'Nubank',
  '31872495': 'C6 Bank',
  '33264668': 'Banco XP',
  '33923798': 'Banco Master',
  '58160789': 'Safra',
  '59285411': 'Banco Pan',
  '59588111': 'BV',
  '60701190': 'Itaú',
  '60746948': 'Bradesco',
  '60889128': 'Sofisa',
  '61186680': 'BMG',
  '62144175': 'Pine',
  '62232889': 'Daycoval',
  '90400888': 'Santander',
  '92702067': 'Banrisul',
  '92894922': 'Banco Original',
}

export function bancoEmissor(cnpj: string | null | undefined): string | null {
  const digitos = cnpj?.replace(/\D/g, '') ?? ''
  if (digitos.length !== 14) return null
  return BANCO_POR_RAIZ[digitos.slice(0, 8)] ?? null
}
