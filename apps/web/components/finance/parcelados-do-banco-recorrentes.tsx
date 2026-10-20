import Link from 'next/link'
import { CreditCard } from 'lucide-react'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { formatBRL } from '@floow/core-finance/src/balance'
import type { ParceladoNoCartao } from '@floow/core-finance'
import { formatarDataDeCalendario } from '@/lib/finance/recurring-dates'

/**
 * Compras parceladas que o banco já mandou com todas as parcelas. Aparecem
 * como série, sem virar recorrência: a parcela real já existe, e uma
 * previsão por cima dela só duplicaria o lançamento e a fila de conciliação.
 */
export function ParceladosDoBancoRecorrentes({ parcelados }: { parcelados: ParceladoNoCartao[] }) {
  if (parcelados.length === 0) return null

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Parcelados no cartão</h2>
          <p className="text-xs text-muted-foreground">
            Vêm do banco com todas as parcelas; não precisam de recorrência nem de conciliação.
          </p>
        </div>
        <Link href="/debts" className="text-sm font-medium text-[#4A5899] hover:underline">
          Ver em Dívidas
        </Link>
      </div>
      <div className="rounded-lg border border-gray-200 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Descrição</TableHead>
              <TableHead>Cartão</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Parcela</TableHead>
              <TableHead>Próxima parcela</TableHead>
              <TableHead>Última parcela</TableHead>
              <TableHead>Saldo devedor</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {parcelados.map((p) => (
              <TableRow key={p.chave}>
                <TableCell className="font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    <CreditCard className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                    {p.description}
                  </span>
                </TableCell>
                <TableCell>{p.accountName}</TableCell>
                <TableCell>{formatBRL(p.installmentCents)}</TableCell>
                <TableCell>{p.parcelasFuturas[0].installmentNumber}/{p.installmentTotal}</TableCell>
                <TableCell>{formatarDataDeCalendario(p.nextDueDate)}</TableCell>
                <TableCell>{formatarDataDeCalendario(p.parcelasFuturas[p.parcelasFuturas.length - 1].date)}</TableCell>
                <TableCell>{formatBRL(p.remainingCents)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  )
}
