'use client'

import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { EMAIL_CONTATO, GLOSSARIO, PERGUNTAS } from '@/lib/ajuda/conteudo'

function semAcento(texto: string) {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function Contato() {
  return (
    <a href={`mailto:${EMAIL_CONTATO}`} className="font-medium text-gray-900 underline">
      Escreva para nós
    </a>
  )
}

/**
 * Perguntas em acordeão com busca. A pergunta do `#hash` já abre — é por ele
 * que o "Como funciona?" das telas chega aqui.
 */
export function CentralDeAjuda() {
  const [busca, setBusca] = useState('')
  const [aberta, setAberta] = useState<string | null>(null)

  useEffect(() => {
    // A rolagem até a âncora o navegador já faz; aqui só abre o item.
    const id = window.location.hash.slice(1)
    if (id) setAberta(id)
  }, [])

  const q = semAcento(busca.trim())
  const perguntas = q
    ? PERGUNTAS.filter((p) => semAcento(`${p.pergunta} ${p.resposta}`).includes(q))
    : PERGUNTAS
  const glossario = q
    ? GLOSSARIO.filter((g) => semAcento(`${g.termo} ${g.definicao}`).includes(q))
    : GLOSSARIO

  return (
    <div className="space-y-8">
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
        <Input
          type="search"
          aria-label="Buscar na ajuda"
          placeholder="Buscar: fatura, importar, Open Finance..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="pl-9"
        />
      </div>

      {perguntas.length === 0 && glossario.length === 0 && (
        <p className="text-sm text-gray-600">
          Nada encontrado para &quot;{busca}&quot;. <Contato /> e contamos como fazer.
        </p>
      )}

      {perguntas.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Perguntas Frequentes</h2>
          <div className="space-y-2">
            {perguntas.map((p) => (
              <details
                key={p.id}
                id={p.id}
                open={aberta === p.id || !!q}
                className="group scroll-mt-20 rounded-lg border border-gray-200 bg-white"
              >
                <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-gray-900 marker:hidden">
                  {p.pergunta}
                </summary>
                <p className="px-4 pb-4 text-sm text-gray-600">{p.resposta}</p>
              </details>
            ))}
          </div>
        </section>
      )}

      {glossario.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Glossário Financeiro</h2>
          <Card>
            <CardContent className="p-0">
              <dl className="divide-y divide-gray-100">
                {glossario.map((g) => (
                  <div key={g.termo} className="px-6 py-4">
                    <dt className="text-sm font-semibold text-gray-900">{g.termo}</dt>
                    <dd className="mt-1 text-sm text-gray-600">{g.definicao}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        </section>
      )}

      <p className="text-sm text-gray-600">
        Não achou o que procurava? <Contato /> em {EMAIL_CONTATO}.
      </p>
    </div>
  )
}
