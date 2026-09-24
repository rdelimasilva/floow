'use client'

import { Input } from '@/components/ui/input'
import { NOVA, type ContaDoFloow } from './wizard-passos'

export interface ProdutoOferecido {
  value: string
  label: string
  hint: string
}

interface PassoDestinosProps {
  produtos: readonly ProdutoOferecido[]
  marcados: string[]
  onToggle: (value: string) => void
  contas: ContaDoFloow[]
  cartoes: ContaDoFloow[]
  destinoConta: string
  nomeConta: string
  destinoCartao: string
  nomeCartao: string
  onDestino: (campo: 'destinoConta' | 'nomeConta' | 'destinoCartao' | 'nomeCartao', valor: string) => void
}

/**
 * Passo 1: o que conectar e para onde vai.
 *
 * O destino é escolhido agora porque as contas do banco só existem depois da
 * autorização — e depois dela o floow aplica a escolha sozinho.
 */
export function PassoDestinos(p: PassoDestinosProps) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium text-foreground">O que conectar e para onde</legend>

      {p.produtos.map((produto) => {
        const marcado = p.marcados.includes(produto.value)
        return (
          <div key={produto.value} className="rounded-lg border border-gray-100 px-3 py-2">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={marcado}
                onChange={() => p.onToggle(produto.value)}
                className="mt-1 rounded border-gray-300"
              />
              <span>
                <span className="block text-sm text-foreground">{produto.label}</span>
                <span className="block text-xs text-gray-500">{produto.hint}</span>
              </span>
            </label>

            {marcado && produto.value === 'ACCOUNT' && (
              <Destino
                id="destino-conta"
                rotulo="Os lançamentos vão para"
                opcoes={p.contas}
                escolha={p.destinoConta}
                nome={p.nomeConta}
                rotuloNova="Criar conta nova"
                placeholderNome="Padrão: <Banco> · Conta"
                onEscolha={(v) => p.onDestino('destinoConta', v)}
                onNome={(v) => p.onDestino('nomeConta', v)}
              />
            )}

            {marcado && produto.value === 'CREDIT_CARD_ACCOUNT' && (
              <Destino
                id="destino-cartao"
                rotulo="As faturas vão para"
                opcoes={p.cartoes}
                escolha={p.destinoCartao}
                nome={p.nomeCartao}
                rotuloNova="Criar novo cartão"
                placeholderNome="Padrão: <Banco> · Cartão"
                onEscolha={(v) => p.onDestino('destinoCartao', v)}
                onNome={(v) => p.onDestino('nomeCartao', v)}
              />
            )}

            {marcado && produto.value === 'INVESTMENTS' && (
              <p className="ml-7 mt-2 text-xs text-gray-500">
                O floow cria a conta &quot;Investimentos · &lt;Banco&gt;&quot; sozinho.
              </p>
            )}
          </div>
        )
      })}

      <p className="text-xs text-gray-500">
        O banco só compartilha o que estiver marcado aqui. Dá para mudar depois refazendo a conexão.
      </p>
    </fieldset>
  )
}

interface DestinoProps {
  id: string
  rotulo: string
  opcoes: ContaDoFloow[]
  escolha: string
  nome: string
  rotuloNova: string
  placeholderNome: string
  onEscolha: (valor: string) => void
  onNome: (valor: string) => void
}

function Destino(d: DestinoProps) {
  return (
    <div className="ml-7 mt-2 space-y-2">
      <label htmlFor={d.id} className="block text-xs text-gray-600">
        {d.rotulo}
      </label>
      <select
        id={d.id}
        value={d.escolha}
        onChange={(e) => d.onEscolha(e.target.value)}
        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
      >
        <option value="">Selecione...</option>
        {d.opcoes.map((conta) => (
          <option key={conta.id} value={conta.id}>
            {conta.name}
          </option>
        ))}
        <option value={NOVA}>+ {d.rotuloNova}</option>
      </select>
      {d.escolha === NOVA && (
        <Input
          aria-label="Nome da nova conta"
          value={d.nome}
          onChange={(e) => d.onNome(e.target.value)}
          placeholder={d.placeholderNome}
        />
      )}
    </div>
  )
}
