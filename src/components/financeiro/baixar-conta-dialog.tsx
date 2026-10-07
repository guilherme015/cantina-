"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { formatCurrency } from "@/lib/utils"
import { baixarContaReceber } from "@/app/actions/financeiro"
import { toast } from "@/hooks/use-toast"
import type { ContaReceber } from "@/types/database"

interface Props {
  conta: ContaReceber | null
  onClose: () => void
}

// Diálogo de "Registrar Recebimento" de uma conta a receber — usado em
// Contas a Receber e na tela do cliente (#57). Quem usa deve renderizar com
// `key={conta?.id}` pra a forma de pagamento voltar a "dinheiro" a cada conta.
export function BaixarContaDialog({ conta, onClose }: Props) {
  const [formaPagamento, setFormaPagamento] = useState("dinheiro")
  const [isPending, startTransition] = useTransition()

  function handleBaixar() {
    if (!conta) return
    startTransition(async () => {
      const result = await baixarContaReceber(conta.id, formaPagamento)
      if (result.error) {
        toast({ title: "Erro", description: result.error, variant: "destructive" })
      } else {
        toast({ title: "Recebimento registrado!", variant: "success" })
        onClose()
      }
    })
  }

  return (
    <Dialog open={!!conta} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar Recebimento</DialogTitle>
        </DialogHeader>
        {conta && (
          <div className="space-y-4">
            <div className="bg-[var(--secondary)] rounded-md p-3">
              <p className="text-sm font-medium">{conta.cliente}</p>
              <p className="text-lg font-bold text-[var(--primary)]">{formatCurrency(conta.valor_devido)}</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Forma de Pagamento</label>
              <Select value={formaPagamento} onValueChange={setFormaPagamento}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dinheiro">Dinheiro</SelectItem>
                  <SelectItem value="pix">PIX</SelectItem>
                  <SelectItem value="cartao">Cartão</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={onClose}>Cancelar</Button>
              <Button onClick={handleBaixar} disabled={isPending}>
                {isPending ? "Registrando..." : "Confirmar Recebimento"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
