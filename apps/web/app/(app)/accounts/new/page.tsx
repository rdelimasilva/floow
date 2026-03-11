'use client'

import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Link from 'next/link'
import { createAccount } from '@/lib/finance/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const newAccountSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(100),
  type: z.enum(['checking', 'savings', 'brokerage', 'credit_card', 'cash']),
})

type NewAccountForm = z.infer<typeof newAccountSchema>

const ACCOUNT_TYPE_OPTIONS = [
  { value: 'checking', label: 'Conta Corrente' },
  { value: 'savings', label: 'Poupança' },
  { value: 'brokerage', label: 'Corretora' },
  { value: 'credit_card', label: 'Cartão de Crédito' },
  { value: 'cash', label: 'Dinheiro em Espécie' },
] as const

export default function NewAccountPage() {
  const router = useRouter()
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<NewAccountForm>({
    resolver: zodResolver(newAccountSchema),
  })

  async function onSubmit(data: NewAccountForm) {
    const formData = new FormData()
    formData.append('name', data.name)
    formData.append('type', data.type)

    await createAccount(formData)
    router.push('/accounts')
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/accounts" className="text-sm text-gray-500 hover:text-gray-700">
          &larr; Contas
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nova Conta</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Name */}
            <div className="space-y-1.5">
              <Label htmlFor="name">Nome da Conta</Label>
              <Input
                id="name"
                placeholder="Ex: Conta Corrente Itaú"
                {...register('name')}
              />
              {errors.name && (
                <p className="text-xs text-red-600">{errors.name.message}</p>
              )}
            </div>

            {/* Type */}
            <div className="space-y-1.5">
              <Label htmlFor="type">Tipo</Label>
              <Select onValueChange={(val) => setValue('type', val as NewAccountForm['type'])}>
                <SelectTrigger id="type">
                  <SelectValue placeholder="Selecione o tipo de conta" />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.type && (
                <p className="text-xs text-red-600">{errors.type.message}</p>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => router.push('/accounts')}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Criando...' : 'Criar Conta'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
