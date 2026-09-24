'use client'

import Link from 'next/link'
import type { ResultadoDaConexaoGuiada } from '@/lib/openfinance/conexao-guiada-actions'
import { AvisoDeAutorizacao } from './aguardando-autorizacao'
import { resumoDaConclusao } from './wizard-passos'

interface PassoAtivarProps {
  /** Linhas do resumo: o que vai para onde. */
  resumo: string[]
  bancoNome: string | null
  /** Conexão criada cuja autorização está aberta na aba do banco. */
  connectionId: string | null
  resultado: ResultadoDaConexaoGuiada | null
}

/**
 * Passo 3: ativar. Antes do clique mostra o resumo; depois, espera a volta da
 * aba do banco e diz o que foi vinculado e importado sozinho.
 */
export function PassoAtivar({ resumo, bancoNome, connectionId, resultado }: PassoAtivarProps) {
  const esperandoBanco = connectionId !== null && (!resultado || resultado.etapa === 'aguardando-autorizacao')

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">Ativar {bancoNome ?? 'a conexão'}</p>
        <ul className="list-disc space-y-0.5 pl-5 text-sm text-gray-600">
          {resumo.map((linha) => (
            <li key={linha}>{linha}</li>
          ))}
        </ul>
        {!connectionId && (
          <p className="text-xs text-gray-500">
            O banco abre numa aba nova. Autorize lá e volte para esta aba: o floow vincula as contas e
            importa os lançamentos sozinho.
          </p>
        )}
      </div>

      {esperandoBanco && <AvisoDeAutorizacao />}

      {connectionId && resultado && resultado.etapa !== 'aguardando-autorizacao' && (
        <Conclusao connectionId={connectionId} resultado={resultado} />
      )}
    </div>
  )
}

function Conclusao({ connectionId, resultado }: { connectionId: string; resultado: ResultadoDaConexaoGuiada }) {
  const { texto, pendencia, erro } = resumoDaConclusao(resultado)
  return (
    <div className="space-y-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900" role="status">
      <p>{texto}</p>
      {pendencia && (
        <p>
          {pendencia}{' '}
          <Link href={`/accounts/connect/${connectionId}`} className="font-medium underline">
            Escolher agora
          </Link>
        </p>
      )}
      {erro && <p className="text-red-700">{erro}</p>}
    </div>
  )
}
