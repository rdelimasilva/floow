'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface AccountSelectProps {
  id: string
  accounts: { id: string; name: string }[]
  placeholder: string
  value?: string
  onChange: (value: string) => void
}

/** Seletor de conta do formulario de transacao — origem e destino. */
export function AccountSelect({ id, accounts, placeholder, value, onChange }: AccountSelectProps) {
  return (
    <Select onValueChange={onChange} value={value}>
      <SelectTrigger id={id}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {accounts.map((acct) => (
          <SelectItem key={acct.id} value={acct.id}>
            {acct.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
