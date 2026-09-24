'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import {
  concluirConexaoGuiada,
  iniciarConexaoGuiada,
  type ResultadoDaConexaoGuiada,
} from '@/lib/openfinance/conexao-guiada-actions'
import { abrirAutorizacao } from '@/lib/openfinance/abrir-autorizacao'
import { useAtualizarAoVoltar } from './aguardando-autorizacao'
import { PassoAtivar } from './passo-ativar'
import { PassoBanco, type Institution } from './passo-banco'
import { PassoDestinos } from './passo-destinos'
import {
  NOVA,
  contasCompativeis,
  continuaEsperando,
  erroDoPasso,
  escolhaInicial,
  montarDestinos,
  type ContaDoFloow,
  type EstadoDoWizard,
} from './wizard-passos'

interface ConnectWizardProps {
  institutions: Institution[]
  loadError: string | null
  /** Contas ativas do floow que ainda não espelham conta do banco. */
  contas: ContaDoFloow[]
}

/**
 * Os produtos que o usuário pode conectar.
 *
 * A lista é curta de propósito. A Polp aceita cinco produtos e, se nenhum for
 * enviado, pede os cinco — crédito, investimentos e câmbio inclusive. Pedir
 * permissão de acesso contínuo a dado que o floow não usa seria cobrar do
 * usuário um consentimento maior do que o serviço prestado.
 */
export const PRODUCTS = [
  {
    value: 'ACCOUNT',
    label: 'Conta corrente e poupança',
    hint: 'Saldo e extrato das contas de depósito.',
  },
  {
    value: 'CREDIT_CARD_ACCOUNT',
    label: 'Cartão de crédito',
    hint: 'Compras, faturas e parcelas.',
  },
  {
    value: 'INVESTMENTS',
    label: 'Investimentos',
    hint: 'Renda fixa, Tesouro, fundos e ações: posição e movimentações. Não mexe no seu extrato.',
  },
] as const

const PASSOS = ['O que conectar e para onde', 'Banco e CPF', 'Ativar'] as const

export function ConnectWizard({ institutions, loadError, contas }: ConnectWizardProps) {
  const { toast } = useToast()
  const router = useRouter()
  const contasCorrentes = contasCompativeis(contas, 'ACCOUNT')
  const cartoes = contasCompativeis(contas, 'CREDIT_CARD_ACCOUNT')

  const inicial = (): EstadoDoWizard => ({
    // Investimentos é opt-in: o consentimento só pede o que o usuário marcar.
    products: ['ACCOUNT', 'CREDIT_CARD_ACCOUNT'],
    destinoConta: escolhaInicial(contasCorrentes),
    nomeConta: '',
    destinoCartao: escolhaInicial(cartoes),
    nomeCartao: '',
    institutionId: '',
    cpf: '',
  })

  const [passo, setPasso] = useState<1 | 2 | 3>(1)
  const [estado, setEstado] = useState<EstadoDoWizard>(inicial)
  const [submitting, setSubmitting] = useState(false)
  // Conexão cuja autorização está aberta na aba do banco.
  const [aguardando, setAguardando] = useState<string | null>(null)
  const [resultado, setResultado] = useState<ResultadoDaConexaoGuiada | null>(null)
  const emAndamento = useRef(false)

  // Para em status terminal (autorizada e aplicada, recusada, expirada).
  const esperando = aguardando !== null && continuaEsperando(resultado)

  function verificar() {
    if (!aguardando || emAndamento.current) return
    emAndamento.current = true
    // Relê o status e, se as contas chegaram, vincula e importa sozinho.
    // Falha aqui não merece alarme: a próxima volta para a aba tenta de novo.
    concluirConexaoGuiada(aguardando)
      .then(setResultado)
      .catch(() => {})
      .finally(() => {
        emAndamento.current = false
        router.refresh()
      })
  }

  useAtualizarAoVoltar(esperando, verificar)

  const selected = institutions.find((i) => i.id === estado.institutionId)
  const banco = selected?.name ?? 'Banco'
  const atualizar = (parcial: Partial<EstadoDoWizard>) => setEstado((e) => ({ ...e, ...parcial }))

  function toggleProduct(value: string) {
    setEstado((e) => ({
      ...e,
      products: e.products.includes(value) ? e.products.filter((p) => p !== value) : [...e.products, value],
    }))
  }

  function avancar() {
    if (passo === 3) return
    const erro = erroDoPasso(passo, estado)
    if (erro) {
      toast(erro, 'error')
      return
    }
    setPasso(passo === 1 ? 2 : 3)
  }

  function destinoLegivel(escolha: string, nome: string, padrao: string, opcoes: ContaDoFloow[]) {
    if (escolha === NOVA) return `conta nova "${nome.trim() || padrao}"`
    return opcoes.find((c) => c.id === escolha)?.name ?? '—'
  }

  const resumo = [
    estado.products.includes('ACCOUNT') &&
      `Conta corrente → ${destinoLegivel(estado.destinoConta, estado.nomeConta, `${banco} · Conta`, contasCorrentes)}`,
    estado.products.includes('CREDIT_CARD_ACCOUNT') &&
      `Cartão → ${destinoLegivel(estado.destinoCartao, estado.nomeCartao, `${banco} · Cartão`, cartoes)}`,
    estado.products.includes('INVESTMENTS') && `Investimentos → "Investimentos · ${banco}"`,
  ].filter((l): l is string => Boolean(l))

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (passo !== 3 || aguardando) return
    setSubmitting(true)

    let connectionId: string | null = null
    try {
      // A aba do banco abre dentro do clique (antes do await) — ver
      // abrir-autorizacao.ts. O link tem validade curta, por isso vai direto
      // para a aba em vez de ficar guardado para depois.
      const aberta = await abrirAutorizacao(async () => {
        const result = await iniciarConexaoGuiada({
          institutionId: estado.institutionId,
          institutionName: selected?.name,
          cpf: estado.cpf,
          products: estado.products,
          destinos: montarDestinos(estado),
        })
        connectionId = result.connectionId
        return result.authUrl
      })

      if (aberta === 'sem-url') {
        toast('Consentimento criado, mas o banco não devolveu o link de autorização.', 'error')
        setSubmitting(false)
        return
      }

      if (aberta === 'nova-aba') {
        setAguardando(connectionId)
        setSubmitting(false)
        router.refresh()
      }
      // 'mesma-aba': esta tela já está indo para o banco; a lista de conexões
      // conclui o vínculo quando o usuário voltar (Buscar contas).
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Não foi possível iniciar a conexão', 'error')
      setSubmitting(false)
    }
  }

  function recomecar() {
    setEstado(inicial())
    setPasso(1)
    setAguardando(null)
    setResultado(null)
  }

  if (loadError) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        {loadError}
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 rounded-xl border border-gray-200 bg-white p-6">
      <ol className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
        {PASSOS.map((nome, i) => (
          <li key={nome} className={passo === i + 1 ? 'font-medium text-foreground' : undefined}>
            {i + 1}. {nome}
          </li>
        ))}
      </ol>

      {passo === 1 && (
        <PassoDestinos
          produtos={PRODUCTS}
          marcados={estado.products}
          onToggle={toggleProduct}
          contas={contasCorrentes}
          cartoes={cartoes}
          destinoConta={estado.destinoConta}
          nomeConta={estado.nomeConta}
          destinoCartao={estado.destinoCartao}
          nomeCartao={estado.nomeCartao}
          onDestino={(campo, valor) => atualizar({ [campo]: valor })}
        />
      )}

      {passo === 2 && (
        <PassoBanco
          institutions={institutions}
          institutionId={estado.institutionId}
          onInstitution={(institutionId) => atualizar({ institutionId })}
          cpf={estado.cpf}
          onCpf={(cpf) => atualizar({ cpf })}
        />
      )}

      {passo === 3 && (
        <PassoAtivar resumo={resumo} bancoNome={selected?.name ?? null} connectionId={aguardando} resultado={resultado} />
      )}

      <div className="flex justify-between gap-2">
        {passo > 1 && !aguardando ? (
          <Button type="button" variant="outline" onClick={() => setPasso(passo === 3 ? 2 : 1)} disabled={submitting}>
            Voltar
          </Button>
        ) : (
          <span />
        )}

        {passo < 3 && (
          <Button type="button" variant="primary" onClick={avancar}>
            Continuar
          </Button>
        )}
        {passo === 3 && !aguardando && (
          <Button type="submit" variant="primary" disabled={submitting}>
            {submitting ? 'Abrindo o banco...' : 'Autorizar no banco'}
          </Button>
        )}
        {passo === 3 && aguardando && esperando && (
          <Button type="button" variant="outline" onClick={verificar}>
            Verificar de novo
          </Button>
        )}
        {passo === 3 && aguardando && !esperando && (
          <Button type="button" variant="outline" onClick={recomecar}>
            Conectar outro banco
          </Button>
        )}
      </div>
    </form>
  )
}
