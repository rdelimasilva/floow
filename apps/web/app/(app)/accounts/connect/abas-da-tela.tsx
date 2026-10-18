'use client'

import { useState, type ReactNode } from 'react'
import { Clock, Plus } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'

type Aba = 'conexoes' | 'nova'

/**
 * Separa a gestão das conexões que já existem do cadastro de uma nova. A tela
 * abre nas conexões; o assistente fica a um clique, pelo botão ou pela aba.
 *
 * As duas abas ficam montadas (forceMount): o assistente guarda em estado o
 * passo em andamento e a espera pela autorização no banco; trocar de aba para
 * conferir uma conexão não pode zerar isso.
 */
export function AbasDaTela({
  novaConexao,
  conexoes,
  totalConexoes,
}: {
  novaConexao: ReactNode
  conexoes: ReactNode
  totalConexoes: number
}) {
  const [aba, setAba] = useState<Aba>('conexoes')
  const criar = (
    <Button onClick={() => setAba('nova')}>
      <Plus className="mr-1.5 h-4 w-4" />
      Criar nova conexão
    </Button>
  )

  return (
    <Tabs value={aba} onValueChange={(v) => setAba(v as Aba)}>
      <TabsList>
        <TabsTrigger value="conexoes">
          Minhas conexões ativas{totalConexoes > 0 ? ` (${totalConexoes})` : ''}
        </TabsTrigger>
        <TabsTrigger value="nova">Nova conexão</TabsTrigger>
      </TabsList>
      <TabsContent value="conexoes" forceMount className="mt-6 space-y-4 data-[state=inactive]:hidden">
        {totalConexoes > 0 ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* O cron de import-transactions roda às 11h UTC (vercel.json). */}
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                <Clock className="h-3.5 w-3.5" />
                Todas as contas são atualizadas diariamente às 8h
              </span>
              {criar}
            </div>
            {conexoes}
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center">
            <p className="text-sm text-gray-500">Nenhum banco conectado ainda.</p>
            <div className="mt-4">{criar}</div>
          </div>
        )}
      </TabsContent>
      <TabsContent value="nova" forceMount className="mt-6 data-[state=inactive]:hidden">
        {novaConexao}
      </TabsContent>
    </Tabs>
  )
}
