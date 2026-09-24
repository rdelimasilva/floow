'use server'

/**
 * Conexão guiada: escolher destino → banco → ativar.
 *
 * As contas e cartões da Polp só existem depois da autorização, então o destino
 * é escolhido ANTES (e guardado na conexão) e aplicado DEPOIS, quando a volta
 * do usuário para a aba do floow relê o status. Tudo aqui orquestra as ações
 * que já existem — start, refresh, link, sync — sem duplicar a regra delas.
 */

import { and, eq, isNull } from 'drizzle-orm'
import { accounts, openfinanceConnections, openfinanceResources } from '@floow/db'
import { withUserDb } from '@/lib/db/rls'
import { getOrgId } from '@/lib/finance/queries'
import {
  refreshBankConnection,
  startBankConnection,
  syncBankConnection,
  type ConnectionSyncResult,
  type StartConnectionInput,
  type StartConnectionResult,
} from './connection-actions'
import { linkResourceToAccount } from './resource-actions'
import { getLastTransactionDateByAccount } from './queries'
import {
  TIPOS_COMPATIVEIS,
  decidirAutoVinculo,
  semDestinos,
  type DestinosGuardados,
  type TipoDeRecurso,
} from './auto-vinculo'

export type DestinoEscolhido = { kind: 'existing'; accountId: string } | { kind: 'new'; name: string }

export interface IniciarConexaoGuiadaInput extends StartConnectionInput {
  destinos: { conta?: DestinoEscolhido | null; cartao?: DestinoEscolhido | null }
}

/**
 * Valida os destinos, cria o consentimento (startBankConnection) e guarda os
 * destinos na conexão.
 *
 * A validação vem ANTES do consentimento: criar consentimento consome cota
 * regulatória por CPF, e descobrir depois que a conta escolhida era de outro
 * tipo deixaria a conexão criada com um destino que não pode ser aplicado.
 */
export async function iniciarConexaoGuiada(
  input: IniciarConexaoGuiadaInput,
): Promise<StartConnectionResult> {
  const orgId = await getOrgId()
  const banco = input.institutionName?.trim() || 'Banco'

  const conta = input.products.includes('ACCOUNT') ? input.destinos.conta ?? null : null
  const cartao = input.products.includes('CREDIT_CARD_ACCOUNT') ? input.destinos.cartao ?? null : null

  if (conta?.kind === 'existing') await conferirConta(orgId, conta.accountId, 'ACCOUNT')
  if (cartao?.kind === 'existing') await conferirConta(orgId, cartao.accountId, 'CREDIT_CARD_ACCOUNT')

  const destinos: DestinosGuardados = {
    targetAccountId: conta?.kind === 'existing' ? conta.accountId : null,
    targetCardAccountId: cartao?.kind === 'existing' ? cartao.accountId : null,
    targetAccountNewName: conta?.kind === 'new' ? nomeDaNova(conta.name, `${banco} · Conta`) : null,
    targetCardNewName: cartao?.kind === 'new' ? nomeDaNova(cartao.name, `${banco} · Cartão`) : null,
  }

  const resultado = await startBankConnection({
    institutionId: input.institutionId,
    institutionName: input.institutionName,
    cpf: input.cpf,
    products: input.products,
  })

  if (!semDestinos(destinos)) {
    // O consentimento já existe e a aba do banco está abrindo: lançar aqui
    // deixaria o usuário sem o link e, ao tentar de novo, barrado por "CPF já
    // conectado". Sem destino gravado, a conexão cai no fluxo manual.
    try {
      await withUserDb((db) =>
        db
          .update(openfinanceConnections)
          .set({ ...destinos, updatedAt: new Date() })
          .where(and(eq(openfinanceConnections.id, resultado.connectionId), eq(openfinanceConnections.orgId, orgId))),
      )
    } catch (error) {
      console.error(`[openfinance] destino da conexao=${resultado.connectionId} nao gravado:`, error)
    }
  }

  return resultado
}

export type EtapaDaConexaoGuiada =
  | 'aguardando-autorizacao'
  | 'aguardando-contas'
  | 'legado'
  | 'ja-concluida'
  | 'concluida'

export interface ResultadoDaConexaoGuiada {
  etapa: EtapaDaConexaoGuiada
  /** O refresh de sempre — quem chamava refreshBankConnection segue lendo daqui. */
  atualizacao: ConnectionSyncResult
  vinculados: number
  /** Dois ou mais do tipo: o usuário escolhe na tela da conexão. */
  ambiguos: TipoDeRecurso[]
  /** Nenhum do tipo, ou o vínculo falhou: também fica para a tela. */
  faltando: TipoDeRecurso[]
  /** Lançamentos importados na primeira sincronização; null se não rodou. */
  importadas: number | null
  erro: string | null
}

/**
 * Relê o status e, se a conexão guiada já pode ser aplicada, vincula e importa.
 *
 * Roda uma vez só por conexão: `auto_link_done_at` é tomado com
 * `UPDATE ... WHERE auto_link_done_at IS NULL` ANTES de vincular, para que a
 * volta à aba (visibilidade + foco) ou duas abas abertas não vinculem em
 * dobro. Se algo falhar depois disso, o que sobrou vai para a tela manual —
 * que é exatamente onde fica também o que o banco liberar mais tarde.
 */
export async function concluirConexaoGuiada(connectionId: string): Promise<ResultadoDaConexaoGuiada> {
  const atualizacao = await refreshBankConnection(connectionId)
  const base: ResultadoDaConexaoGuiada = {
    etapa: 'aguardando-autorizacao',
    atualizacao,
    vinculados: 0,
    ambiguos: [],
    faltando: [],
    importadas: null,
    erro: null,
  }
  if (atualizacao.status !== 'AUTHORISED') return base

  const orgId = await getOrgId()
  const [conexao] = await withUserDb((db) =>
    db
      .select({
        targetAccountId: openfinanceConnections.targetAccountId,
        targetCardAccountId: openfinanceConnections.targetCardAccountId,
        targetAccountNewName: openfinanceConnections.targetAccountNewName,
        targetCardNewName: openfinanceConnections.targetCardNewName,
        autoLinkDoneAt: openfinanceConnections.autoLinkDoneAt,
      })
      .from(openfinanceConnections)
      .where(and(eq(openfinanceConnections.id, connectionId), eq(openfinanceConnections.orgId, orgId)))
      .limit(1),
  )
  if (!conexao) throw new Error('Conexão não encontrada')

  if (semDestinos(conexao)) return { ...base, etapa: 'legado' }
  if (conexao.autoLinkDoneAt) return { ...base, etapa: 'ja-concluida' }

  // Sem contas ainda, ou parte delas em preparo: decidir agora poderia chamar
  // de "ambíguo" o que só estava incompleto. A próxima volta decide.
  if (atualizacao.resources.length === 0 || atualizacao.pendingResourceCount > 0) {
    return { ...base, etapa: 'aguardando-contas' }
  }

  const tomada = await withUserDb((db) =>
    db
      .update(openfinanceConnections)
      .set({ autoLinkDoneAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(openfinanceConnections.id, connectionId),
          eq(openfinanceConnections.orgId, orgId),
          isNull(openfinanceConnections.autoLinkDoneAt),
        ),
      )
      .returning({ id: openfinanceConnections.id }),
  )
  if (tomada.length === 0) return { ...base, etapa: 'ja-concluida' }

  const ultimas = await getLastTransactionDateByAccount(orgId)
  const decisao = decidirAutoVinculo(conexao, atualizacao.resources, ultimas)

  const resultado: ResultadoDaConexaoGuiada = {
    ...base,
    etapa: 'concluida',
    ambiguos: decisao.ambiguos,
    faltando: [...decisao.faltando],
  }

  for (const v of decisao.vinculos) {
    try {
      await linkResourceToAccount(v.resourceId, v.target, { syncFromDate: v.syncFromDate })
      resultado.vinculados++
    } catch (error) {
      resultado.faltando.push(v.resourceType)
      resultado.erro = mensagem(error, 'Não foi possível vincular a conta')
    }
  }

  // Uma vez, mesmo sem vínculo: é a sincronização que também traz os
  // investimentos, se o consentimento os pediu.
  try {
    const resumo = await syncBankConnection(connectionId)
    resultado.importadas = resumo.imported
  } catch (error) {
    resultado.erro = mensagem(error, 'Não foi possível importar os lançamentos')
  }

  return resultado
}

/** A conta é da org, está ativa, é do tipo certo e não espelha outro recurso? */
async function conferirConta(orgId: string, accountId: string, tipo: TipoDeRecurso): Promise<void> {
  await withUserDb(async (db) => {
    const [conta] = await db
      .select({ id: accounts.id, type: accounts.type })
      .from(accounts)
      .where(and(eq(accounts.id, accountId), eq(accounts.orgId, orgId), eq(accounts.isActive, true)))
      .limit(1)

    if (!conta) throw new Error('Conta não encontrada')
    if (!TIPOS_COMPATIVEIS[tipo].includes(conta.type)) {
      throw new Error(
        tipo === 'CREDIT_CARD_ACCOUNT'
          ? 'O cartão só pode ir para uma conta do tipo cartão.'
          : 'A conta corrente não pode ir para uma conta de cartão ou de investimentos.',
      )
    }

    const [ocupada] = await db
      .select({ id: openfinanceResources.id })
      .from(openfinanceResources)
      .where(and(eq(openfinanceResources.orgId, orgId), eq(openfinanceResources.accountId, accountId)))
      .limit(1)

    if (ocupada) throw new Error('Esta conta do floow já está vinculada a outra conta do banco.')
  })
}

function nomeDaNova(nome: string, padrao: string): string {
  return (nome.trim() || padrao).slice(0, 120)
}

function mensagem(error: unknown, padrao: string): string {
  return error instanceof Error && error.message ? error.message : padrao
}
