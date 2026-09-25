'use client'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

interface Opcao {
  id: string
  label: string
}

interface Props {
  opcoes: Opcao[]
  value: string
  onChange: (id: string) => void
  /** Rótulo de "nenhuma categoria"; quando existe, vira a primeira opção. */
  vazio?: string
  /** Opções antes das categorias, como "+ Criar automaticamente". */
  extras?: Opcao[]
  placeholder?: string
  className?: string
  id?: string
}

// O Radix não aceita item com valor vazio: o "nenhuma" anda com um sentinela.
const VAZIO = '__vazio__'

/**
 * Categoria com busca (o Select do sistema filtra sem acento). Não serve dentro
 * de <dialog> modal: o menu abre num portal fora do diálogo e fica inerte.
 */
export function SeletorDeCategoria({ opcoes, value, onChange, vazio, extras = [], placeholder = 'Selecione...', className, id }: Props) {
  const atual = value === '' ? (vazio ? VAZIO : undefined) : value
  return (
    <Select value={atual} onValueChange={(v) => onChange(v === VAZIO ? '' : v)}>
      <SelectTrigger id={id} className={cn('h-8 text-xs', className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {vazio && <SelectItem value={VAZIO}>{vazio}</SelectItem>}
        {extras.map((o) => (
          <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
        ))}
        {opcoes.map((o) => (
          <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
