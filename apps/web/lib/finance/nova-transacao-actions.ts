'use server'

import { getOrgId, getAccounts, getCategories, getCategoryUsageOrder } from './queries'
import { contasParaLancamento, contasDeTransferencia } from './account-options'
import { opcoesDeCategoriaParaLancamento } from './category-options'

/** Contas e categorias do modal de nova transação, o mesmo recorte da tela de Transações. */
export async function getOpcoesDaNovaTransacao() {
  const orgId = await getOrgId()
  const [accounts, categories, ordemDeUso] = await Promise.all([
    getAccounts(orgId),
    getCategories(orgId),
    getCategoryUsageOrder(orgId),
  ])
  return {
    accounts: contasParaLancamento(accounts),
    transferAccounts: contasDeTransferencia(accounts),
    categories: opcoesDeCategoriaParaLancamento(categories, ordemDeUso),
  }
}
