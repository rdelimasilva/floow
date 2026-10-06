'use client'

import { useEffect, useState } from 'react'
import { CHAVE_PULADOS } from '@/lib/onboarding/primeiros-passos'

function ler(): string[] {
  try {
    const bruto = JSON.parse(localStorage.getItem(CHAVE_PULADOS) ?? '[]')
    return Array.isArray(bruto) ? bruto.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

/**
 * Passos que o usuário pulou. Fica no navegador: é conveniência de quem está
 * se cadastrando, e o que importa (a conta existir) vem do banco.
 */
export function usePassosPulados() {
  const [pulados, setPulados] = useState<string[]>([])

  useEffect(() => setPulados(ler()), [])

  function pular(id: string) {
    const novos = Array.from(new Set([...ler(), id]))
    setPulados(novos)
    try {
      localStorage.setItem(CHAVE_PULADOS, JSON.stringify(novos))
    } catch {
      // Sem armazenamento o pulo vale só até recarregar.
    }
  }

  return { pulados, pular }
}
