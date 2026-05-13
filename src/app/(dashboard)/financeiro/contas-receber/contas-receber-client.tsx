"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
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
import { ArrowDownCircle, CheckCircle } from "lucide-react"
import { formatCurrency, formatDate } from "@/lib/utils"
import { baixarContaReceber } from "@/app/actions/financeiro"
import { toast } from "@/hooks/use-toast"
import type { ContaReceber } from "@/types/database"

interface Props {
  contas: ContaReceber[]
}

export function ContasReceberClient({ contas }: Props) {
  const [baixando, setBaixando] = useState<ContaReceber | null>(null)
  const [formaPagamento, setFormaPagamento] = useState("dinheiro")
  const [isPending, startTransition] = useTransition()

  const abertas = contas.filter((c) => !c.pago)
  const recebidas = contas.filter((c) => c.pago)

  const totalAberto = abertas.reduce((s, c) => s + c.valor_devido, 0)
  const totalRecebido = recebidas.reduce((s, c) => s + c.valor_devido, 0)

  function handleBaixar() {
    if (!baixando) return
    startTransition(async () => {
      const result = await baixarContaReceber(baixando.id, formaPagamento)
      if (result.error) {
        toast({ title: "Erro", description: result.error, variant: "destructive" })
      } else {
        toast({ title: "Recebimento registrado!", variant: "success" })
        setBaixando(null)
      }
    })
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
                <ArrowDownCircle className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <p className="text-xs text-[var(--muted-foreground)]">Total em Aberto</p>
                <p className="text-xl font-bold text-orange-600">{formatCurrency(totalAberto)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-[var(--muted-foreground)]">Total Recebido</p>
                <p className="text-xl font-bold text-green-600">{formatCurrency(totalRecebido)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-base">Fiados em Aberto ({abertas.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {abertas.length === 0 ? (
            <div className="flex items-center justify-center flex-col gap-3 py-8 text-[var(--muted-foreground)]">
              <ArrowDownCircle className="w-12 h-12 opacity-30" />
              <p className="text-sm">Nenhuma conta a receber em aberto.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {abertas.map((c) => (
                <div key={c.id} className="flex items-center justify-between p-3 border border-[var(--border)] rounded-md">
                  <div>
                    <p className="font-medium text-sm">{c.cliente}</p>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {formatDate(c.data_venda)}{c.descricao ? ` · ${c.descricao}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-orange-600">{formatCurrency(c.valor_devido)}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      onClick={() => { setBaixando(c); setFormaPagamento("dinheiro") }}
                    >
                      <CheckCircle className="w-3 h-3" /> Receber
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {recebidas.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-[var(--muted-foreground)]">Recebidos ({recebidas.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recebidas.map((c) => (
                <div key={c.id} className="flex items-center justify-between p-3 border border-[var(--border)] rounded-md opacity-60">
                  <div>
                    <p className="font-medium text-sm line-through">{c.cliente}</p>
                    <p className="text-xs text-[var(--muted-foreground)]">{formatDate(c.data_venda)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold">{formatCurrency(c.valor_devido)}</span>
                    <Badge variant="secondary">Recebido</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!baixando} onOpenChange={(o) => { if (!o) setBaixando(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Recebimento</DialogTitle>
          </DialogHeader>
          {baixando && (
            <div className="space-y-4">
              <div className="bg-[var(--secondary)] rounded-md p-3">
                <p className="text-sm font-medium">{baixando.cliente}</p>
                <p className="text-lg font-bold text-[var(--primary)]">{formatCurrency(baixando.valor_devido)}</p>
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
                <Button variant="outline" onClick={() => setBaixando(null)}>Cancelar</Button>
                <Button onClick={handleBaixar} disabled={isPending}>
                  {isPending ? "Registrando..." : "Confirmar Recebimento"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
