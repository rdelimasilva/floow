'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export interface Institution {
  id: string
  name: string
  logoUrl: string | null
  type: string
}

interface PassoBancoProps {
  institutions: Institution[]
  institutionId: string
  onInstitution: (id: string) => void
  cpf: string
  onCpf: (cpf: string) => void
}

/** Passo 2: banco e CPF do titular. */
export function PassoBanco({ institutions, institutionId, onInstitution, cpf, onCpf }: PassoBancoProps) {
  const [search, setSearch] = useState('')
  const filtered = search
    ? institutions.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()))
    : institutions

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <Label htmlFor="institution-search">Banco</Label>
        <Input
          id="institution-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar banco pelo nome"
          autoComplete="off"
        />
        <div className="mt-2 max-h-64 space-y-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-1 py-3 text-sm text-gray-500">Nenhum banco encontrado.</p>
          ) : (
            filtered.map((institution) => (
              <label
                key={institution.id}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  institutionId === institution.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-100 hover:bg-gray-50'
                }`}
              >
                <input
                  type="radio"
                  name="institution"
                  value={institution.id}
                  checked={institutionId === institution.id}
                  onChange={() => onInstitution(institution.id)}
                  className="border-gray-300"
                />
                {institution.logoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={institution.logoUrl} alt="" className="h-6 w-6 rounded object-contain" />
                )}
                <span className="text-foreground">{institution.name}</span>
              </label>
            ))
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cpf">CPF do titular</Label>
        <Input
          id="cpf"
          value={cpf}
          onChange={(e) => onCpf(e.target.value)}
          placeholder="000.000.000-00"
          inputMode="numeric"
          autoComplete="off"
        />
        <p className="text-xs text-gray-500">
          Usado só para criar o consentimento no banco. O floow guarda uma versão mascarada e um
          código irreversível — o número em si não fica armazenado.
        </p>
      </div>
    </div>
  )
}
