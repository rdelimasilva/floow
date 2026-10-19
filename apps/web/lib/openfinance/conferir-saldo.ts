import { getDb, openfinanceResources } from '@floow/db'
import { eq, sql } from 'drizzle-orm'
import {
  extrairApuracaoDoSaldo,
  extrairSaldoDisponivelCents,
  type PolpClient,
} from '@floow/core-finance'

type Db = ReturnType<typeof getDb>

/**
 * Guarda o saldo que o BANCO informa, ao lado do que nós derivamos.
 *
 * `accounts.balance_cents` é a soma dos lançamentos aplicados — um número que
 * construímos. Até aqui ninguém o conferia com a fonte, e o primeiro erro real
 * passou três dias invisível: a Polp reemitiu um pagamento de fatura com outro
 * `external_id`, o dedupe por id não pegou, e R$ 11.685,40 entraram duas vezes
 * no saldo do usuário.
 *
 * Um detector de duplicata resolve o defeito que já conhecemos. Conferir os
 * dois números resolve a classe inteira — lançamento faltando, reemitido,
 * duplicado ou erro nosso de saldo fazem os dois divergirem, e não precisamos
 * ter previsto qual foi.
 *
 * Roda DEPOIS da importação de propósito: o saldo do banco só vale como
 * conferência do que acabou de entrar.
 */
export async function registrarSaldoDoBanco(
  db: Db,
  client: PolpClient,
  resource: { id: string; polpResourceId: string; resourceType: string },
): Promise<void> {
  // A importação já gravou o extrato quando chegamos aqui. Deixar a conferência
  // estourar perderia o dado por causa do controle dele — o mesmo motivo pelo
  // qual `connection-actions.ts:411` engole a falha do detalhe.
  const detalhe = await client.getResourceDetail(resource.resourceType, resource.polpResourceId).catch(() => null)
  if (detalhe === null) return

  const saldoCents = extrairSaldoDisponivelCents(detalhe)
  // `null` é a resposta honesta de `CREDIT_CARD_ACCOUNT`, cujo detalhe traz
  // `limits` e nunca `balance`: fatura e limite usado não são a mesma pergunta
  // que saldo. Gravar zero aqui fingiria uma conferência que não houve.
  if (saldoCents === null) return

  const apuracao = extrairApuracaoDoSaldo(detalhe)
  await db
    .update(openfinanceResources)
    .set({
      bankBalanceCents: saldoCents,
      bankBalanceAt: apuracao,
      divergenciaLeituras: leiturasDivergentes(saldoCents, apuracao),
      updatedAt: new Date(),
    })
    .where(eq(openfinanceResources.id, resource.id))
}

/**
 * Quantas leituras seguidas do banco discordaram do nosso saldo, contando
 * esta. O Itaú desconta o débito automático do saldo no dia e só põe a linha
 * no extrato no dia seguinte, carimbada depois da apuração: por um sync os
 * dois discordam sem lançamento errado nenhum. O aviso espera a segunda
 * leitura (`LEITURAS_PARA_AVISAR`).
 *
 * Mesma conta de `compararComOBanco`, com o "chegou depois" de
 * `consultaSaldosDoBanco`, mas contra a apuração nova (no SET, a coluna
 * ainda tem a antiga). Conta sem vínculo dá NULL e zera. Data em SQL cru vai
 * como texto: o postgres-js recusa `Date` como parâmetro.
 */
function leiturasDivergentes(saldoCents: number, apuracao: Date | null) {
  return sql`case when (
      (select a.balance_cents from accounts a where a.id = "openfinance_resources"."account_id")
      - (select coalesce(sum(t.amount_cents), 0)
           from transactions t
          where t.account_id = "openfinance_resources"."account_id"
            and t.origem = 'extrato'
            and t.balance_applied and not t.is_ignored
            and date_trunc('second', t.ocorrido_em) > ${apuracao?.toISOString() ?? null}::timestamptz)
      - ${saldoCents}
    ) <> 0 then "openfinance_resources"."divergencia_leituras" + 1 else 0 end`
}
