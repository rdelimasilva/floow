import ExcelJS from 'exceljs'

/**
 * Planilhas de exportação. Valor em número (reais) e data como data, para a
 * planilha somar e filtrar sem conversão — o CSV entrega texto formatado.
 */

const FORMATO_BRL = '"R$" #,##0.00;[Red]-"R$" #,##0.00'
const FORMATO_DIA = 'dd/mm/yyyy'

const TIPOS: Record<string, string> = {
  income: 'Receita',
  expense: 'Despesa',
  transfer: 'Transferência',
}

export interface LinhaDeTransacao {
  /** Dia do lançamento, `YYYY-MM-DD`. */
  dia: string
  descricao: string | null
  categoria: string | null
  tipo: string
  amountCents: number
}

export interface MesDoFluxo {
  /** `YYYY-MM`. */
  month: string
  income: number
  expense: number
  net: number
}

/** Meio-dia UTC: a data não muda de dia em nenhum fuso ao abrir a planilha. */
function diaComoData(dia: string): Date {
  return new Date(`${dia}T12:00:00Z`)
}

function cabecalho(sheet: ExcelJS.Worksheet) {
  const linha = sheet.getRow(1)
  linha.font = { bold: true }
  sheet.views = [{ state: 'frozen', ySplit: 1 }]
}

async function paraBuffer(book: ExcelJS.Workbook): Promise<Buffer> {
  return Buffer.from(await book.xlsx.writeBuffer())
}

export async function planilhaDeTransacoes(linhas: LinhaDeTransacao[]): Promise<Buffer> {
  const book = new ExcelJS.Workbook()
  const sheet = book.addWorksheet('Transações')
  sheet.columns = [
    { header: 'Data', key: 'data', width: 12, style: { numFmt: FORMATO_DIA } },
    { header: 'Descrição', key: 'descricao', width: 48 },
    { header: 'Categoria', key: 'categoria', width: 24 },
    { header: 'Tipo', key: 'tipo', width: 14 },
    { header: 'Valor', key: 'valor', width: 16, style: { numFmt: FORMATO_BRL } },
  ]
  for (const l of linhas) {
    sheet.addRow({
      data: diaComoData(l.dia),
      descricao: l.descricao ?? '',
      categoria: l.categoria ?? '',
      tipo: TIPOS[l.tipo] ?? l.tipo,
      valor: l.amountCents / 100,
    })
  }
  cabecalho(sheet)
  return paraBuffer(book)
}

/** Realizado e previsto por mês, do mais antigo ao mais novo, como a tela lê. */
export async function planilhaDeFluxoDeCaixa(realizado: MesDoFluxo[], previsto: MesDoFluxo[]): Promise<Buffer> {
  const book = new ExcelJS.Workbook()
  const sheet = book.addWorksheet('Fluxo de caixa')
  sheet.columns = [
    { header: 'Mês', key: 'mes', width: 10 },
    { header: 'Situação', key: 'situacao', width: 12 },
    { header: 'Receitas', key: 'receitas', width: 16, style: { numFmt: FORMATO_BRL } },
    { header: 'Despesas', key: 'despesas', width: 16, style: { numFmt: FORMATO_BRL } },
    { header: 'Resultado', key: 'resultado', width: 16, style: { numFmt: FORMATO_BRL } },
  ]
  const linhas = [
    ...realizado.map((m) => ({ ...m, situacao: 'Realizado' })),
    ...previsto.map((m) => ({ ...m, situacao: 'Previsto' })),
  ].sort((a, b) => a.month.localeCompare(b.month) || (a.situacao === 'Realizado' ? -1 : 1))
  for (const m of linhas) {
    const [ano, mes] = m.month.split('-')
    sheet.addRow({
      mes: `${mes}/${ano}`,
      situacao: m.situacao,
      receitas: m.income / 100,
      despesas: m.expense / 100,
      resultado: m.net / 100,
    })
  }
  cabecalho(sheet)
  return paraBuffer(book)
}

export const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
