import Link from 'next/link'
import { getAccounts, getOrgId, getSaldosDoBanco } from '@/lib/finance/queries'
import { BankDivergenceAlert } from '@/components/finance/bank-divergence-alert'
import { AccountCard } from '@/components/finance/account-card'
import { getContasDeInvestimentoOpenFinance, getValorDasContasDeInvestimento } from '@/lib/openfinance/queries'
import { getLogosDasContas } from '@/lib/openfinance/logos-das-contas'
import { formatBRL } from '@floow/core-finance'
import { agruparPorBloco } from '@/lib/finance/account-types'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'

export default async function AccountsPage() {
  const orgId = await getOrgId()
  // O saldo aqui e derivado da soma dos lancamentos; o banco tem o proprio
  // numero. Conferir os dois e o que pega o lancamento duplicado, o que
  // faltou, e o erro nosso — sem precisar saber de antemao qual foi.
  const [accounts, saldosDoBanco, contasDeInvestimento, valorDasPosicoes, logos] = await Promise.all([
    getAccounts(orgId), getSaldosDoBanco(orgId), getContasDeInvestimentoOpenFinance(orgId),
    getValorDasContasDeInvestimento(orgId), getLogosDasContas(orgId),
  ])
  const conferidas = accounts.map((a) => ({
    accountId: a.id,
    nome: a.name,
    saldoLocalCents: a.balanceCents,
    saldoBancoCents: saldosDoBanco.get(a.id)?.bankBalanceCents ?? null,
    apuradoEm: saldosDoBanco.get(a.id)?.bankBalanceAt ?? null,
  }))

  // Conta de investimentos do Open Finance vale o que as posições valem, não o
  // saldo de lançamentos (zerado numa conexão só de investimentos).
  const valorDe = (a: (typeof accounts)[number]) => valorDasPosicoes.get(a.id) ?? a.balanceCents
  const totalBalanceCents = accounts.reduce((sum, a) => sum + valorDe(a), 0)
  const blocos = agruparPorBloco(accounts).map((b) => ({
    ...b,
    subtotalCents: b.contas.reduce((sum, a) => sum + valorDe(a), 0),
  }))
  const corDoValor = (cents: number) => (cents < 0 ? 'text-red-600' : 'text-gray-900')

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader title="Contas">
        <div className="group relative">
          <Button asChild variant="outline">
            <Link href="/accounts/connect" aria-describedby="dica-importar-banco">Importar do meu banco</Link>
          </Button>
          <div
            id="dica-importar-banco"
            role="tooltip"
            className="pointer-events-none absolute right-0 top-full z-50 mt-2 w-72 rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground opacity-0 shadow-md transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
          >
            Conecta sua conta pelo Open Finance: contas, cartões, investimentos e lançamentos entram sozinhos e
            continuam atualizados, sem digitar nada.
          </div>
        </div>
        <Button asChild variant="primary">
          <Link href="/accounts/new">Nova Conta</Link>
        </Button>
      </PageHeader>
      {accounts.length > 0 && (
        <div className="-mt-2 flex flex-wrap gap-x-10 gap-y-3">
          {blocos.map((b) => (
            <div key={b.key}>
              <p className="text-xs text-gray-500">{b.titulo}</p>
              <p className={`text-lg font-semibold ${corDoValor(b.subtotalCents)}`}>{formatBRL(b.subtotalCents)}</p>
            </div>
          ))}
          {blocos.length > 1 && (
            <div className="border-l border-gray-200 pl-10">
              <p className="text-xs text-gray-500">Patrimônio total</p>
              <p className={`text-lg font-semibold ${totalBalanceCents < 0 ? 'text-red-600' : 'text-green-700'}`}>
                {formatBRL(totalBalanceCents)}
              </p>
            </div>
          )}
        </div>
      )}

      <BankDivergenceAlert divergencias={conferidas} />

      {/* Account grid */}
      {accounts.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white py-16 text-center">
          <p className="text-gray-500">Nenhuma conta encontrada.</p>
          <p className="mt-1 text-sm text-gray-400">
            Crie sua primeira conta para começar.
          </p>
          <Button asChild variant="primary" className="mt-4">
            <Link href="/accounts/new">Criar Conta</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-8">
          {blocos.map((bloco) => {
            return (
              <section key={bloco.key} className="space-y-3">
                <h2 className="border-b border-gray-200 pb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
                  {bloco.titulo}
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {bloco.contas.map((account) => (
                    <AccountCard
                      key={account.id}
                      account={account}
                      logoUrl={logos.get(account.id)}
                      tipoTravado={contasDeInvestimento.has(account.id)}
                      valorDasPosicoesCents={contasDeInvestimento.has(account.id) ? (valorDasPosicoes.get(account.id) ?? 0) : undefined}
                    />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
