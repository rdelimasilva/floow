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

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Contas"
        description={accounts.length > 0 ? 'Patrimônio total' : undefined}
      >
        <Button asChild variant="outline">
          <Link href="/accounts/connect">Conectar Banco</Link>
        </Button>
        <Button asChild variant="primary">
          <Link href="/accounts/new">Nova Conta</Link>
        </Button>
      </PageHeader>
      {accounts.length > 0 && (
        <p className={`-mt-4 text-lg font-semibold ${totalBalanceCents < 0 ? 'text-red-600' : 'text-green-700'}`}>
          {formatBRL(totalBalanceCents)}
        </p>
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
          {agruparPorBloco(accounts).map((bloco) => {
            const subtotalCents = bloco.contas.reduce((sum, a) => sum + valorDe(a), 0)
            return (
              <section key={bloco.key} className="space-y-3">
                <div className="flex items-baseline justify-between border-b border-gray-200 pb-2">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{bloco.titulo}</h2>
                  <span className={`text-sm font-semibold ${subtotalCents < 0 ? 'text-red-600' : 'text-gray-700'}`}>
                    {formatBRL(subtotalCents)}
                  </span>
                </div>
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
