import { describe, it, expect } from 'vitest'
import { PgDialect, alias } from 'drizzle-orm/pg-core'
import { accounts, transactions } from '@floow/db'
import { sqlContaNoSaldo } from '@/lib/finance/balance-sql'

/**
 * A regra de "esta linha soma no saldo da listagem" existe em dois lugares
 * porque precisa: no cliente, para a coluna linha a linha
 * (`contaNoSaldoProjetado`), e no Postgres, para as somas de janela de onde
 * sai o `startingBalance` de cada pagina.
 *
 * Elas TEM que dizer a mesma coisa. Quando divergem o estrago e silencioso: o
 * saldo do topo da pagina sai de uma regra e os incrementos de outra, e a
 * coluna inteira fica errada sem nada quebrar. Foi o que aconteceu ao fazer a
 * previsao futura contar no cliente sem mexer no SQL.
 *
 * Este teste prende o lado SQL. O lado do cliente esta em
 * `saldo-projetado.test.ts`, e os dois descrevem os mesmos tres criterios.
 */

const dialect = new PgDialect()
const consulta = dialect.sqlToQuery(sqlContaNoSaldo('2026-09-19'))
const gerado = consulta.sql.toLowerCase()

describe('regra de saldo no SQL', () => {
  it('exclui conta de investimento', () => {
    // O tipo vai como parametro vinculado, nao literal no SQL — o drizzle
    // expande a lista em um `$n` por item.
    expect(gerado).toContain('"accounts"."type" not in')
    expect(consulta.params).toContain('brokerage')
  })

  /**
   * No extrato de UMA conta nao ha segunda perna para anular: a corretora
   * precisa do saldo corrido como qualquer outra. A exclusao so faz sentido
   * quando corrente e corretora dividem a mesma coluna.
   */
  it('com incluirInvestimento, nao filtra pelo tipo da conta', () => {
    const uma = dialect.sqlToQuery(
      sqlContaNoSaldo('2026-09-19', undefined, { incluirInvestimento: true }),
    )
    expect(uma.sql.toLowerCase()).not.toContain('"type" not in')
    expect(uma.params).not.toContain('brokerage')
  })

  it('inclui o que ja foi aplicado no saldo', () => {
    expect(gerado).toContain('"balance_applied"')
  })

  it('inclui previsao futura, pela data', () => {
    expect(gerado).toContain('"date"')
    expect(gerado).toContain('>')
  })

  it('exclui previsao ja casada com o realizado', () => {
    expect(gerado).toContain('"matched_transaction_id" is null')
  })

  /**
   * O salario adiantado: previsao de R$ 32.500 no dia 15, banco credita
   * R$ 32.638,85 no dia 13 porque o dia 15 caiu no sabado, hoje e 14.
   *
   * O realizado ja soma (`balance_applied`). A previsao ainda nao venceu e
   * somaria tambem, porque o vinculo so e gravado quando o usuario aprova na
   * fila — as duas linhas contariam o MESMO dinheiro. Previsao com proposta
   * aberta sai da projecao.
   */
  it('exclui previsao com proposta de conciliacao aberta', () => {
    expect(gerado).toContain('not exists (select 1 from "forecast_match_proposals"')
    expect(gerado).toContain('"forecast_transaction_id"')
    expect(gerado).toContain("'pending'")
  })

  /**
   * Em `getTransactionsWithCount` a regra roda dentro de uma subquery
   * correlacionada sobre a MESMA tabela da consulta externa, com alias
   * proprio. A subconsulta de proposta precisa correlacionar com a linha do
   * ALIAS: apontando para `"transactions"."id"` ela leria a linha de fora, e
   * uma unica previsao com proposta aberta tiraria do saldo todas as linhas
   * da pagina.
   */
  it('correlaciona a proposta pelo alias da linha, nao pela tabela de fora', () => {
    const txSaldo = alias(transactions, 'tx_saldo')
    const contaSaldo = alias(accounts, 'conta_saldo')
    const comAlias = dialect
      .sqlToQuery(sqlContaNoSaldo('2026-09-19', { tx: txSaldo, acc: contaSaldo }))
      .sql.toLowerCase()

    expect(comAlias).toContain('= "tx_saldo"."id"')
    expect(comAlias).not.toContain('"transactions"."id"')
  })
})

/**
 * Lancamento ignorado nao soma em saldo nenhum.
 *
 * `is_ignored` significa "este lancamento e errado, nao existe", e
 * `toggleIgnoreTransaction` ja estorna `accounts.balance_cents` quando o
 * usuario marca. A regra desta coluna nao olhava a flag, entao a listagem
 * continuava somando o que a conta ja tinha devolvido: na conta real a coluna
 * mostrou -R$ 4.290,37 onde o saldo era R$ 6.151,18, R$ 10.441,55 de
 * diferenca — exatamente as tres linhas ignoradas.
 *
 * O comentario de `contaNoSaldoProjetado` dizia "realizado: ja esta em
 * accounts.balance_cents". Para o ignorado essa premissa e falsa, e era dela
 * que a regra dependia.
 */
describe('sqlContaNoSaldo e o lancamento ignorado', () => {
  it('tira da soma o lancamento marcado como ignorado', () => {
    const gerado = dialect.sqlToQuery(sqlContaNoSaldo('2026-09-22')).sql.toLowerCase()

    expect(gerado).toContain('"is_ignored"')
  })

  it('le a flag do alias da linha, nao da tabela de fora', () => {
    const txSaldo = alias(transactions, 'tx_saldo')
    const contaSaldo = alias(accounts, 'conta_saldo')
    const comAlias = dialect
      .sqlToQuery(sqlContaNoSaldo('2026-09-22', { tx: txSaldo, acc: contaSaldo }))
      .sql.toLowerCase()

    expect(comAlias).toContain('"tx_saldo"."is_ignored"')
  })
})
