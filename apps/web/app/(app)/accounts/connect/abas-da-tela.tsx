'use client'

import type { ReactNode } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

/**
 * Separa o cadastro de uma conexão nova da gestão das que já existem.
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
  return (
    <Tabs defaultValue="nova">
      <TabsList>
        <TabsTrigger value="nova">Nova conexão</TabsTrigger>
        <TabsTrigger value="conexoes">
          Minhas conexões{totalConexoes > 0 ? ` (${totalConexoes})` : ''}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="nova" forceMount className="mt-6 data-[state=inactive]:hidden">
        {novaConexao}
      </TabsContent>
      <TabsContent value="conexoes" forceMount className="mt-6 data-[state=inactive]:hidden">
        {totalConexoes > 0 ? (
          conexoes
        ) : (
          <p className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
            Nenhum banco conectado ainda.
          </p>
        )}
      </TabsContent>
    </Tabs>
  )
}
