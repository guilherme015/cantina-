"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { TrendingUp, TrendingDown, DollarSign, Pencil, Trash2 } from "lucide-react"
import { formatCurrency, formatDateTime } from "@/lib/utils"
import { editarExtrato, excluirExtrato } from "@/app/actions/financeiro"
import { toast } from "@/hooks/use-toast"
import type { ExtratoFinanceiro } from "@/types/database"

const FORMA_LABEL: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  cartao: "Cartão",
  fiado: "Fiado",
}

interface Props {
  movimentacoes: ExtratoFinanceiro[]
}

export function ExtratoClient({ movimentacoes: inicial }: Props) {
  const [movimentacoes, setMovimentacoes] = useState(inicial)
  const [editando, setEditando] = useState<ExtratoFinanceiro | null>(null)
  const [isPending, startTransition] = useTransition()

  const entradas = movimentacoes.filter((m) => m.tipo_movimentacao === "entrada").reduce((s, m) => s + m.valor, 0)
  const saidas = movimentacoes.filter((m) => m.tipo_movimentacao === "saida").reduce((s, m) => s + m.valor, 0)
  const saldo = entradas - saidas

  function handleEditar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!editando) return
    const fd = new FormData(e.currentTarget)
    const dados = {
      descricao: fd.get("descricao") as string,
      valor: parseFloat(fd.get("valor") as string),
      tipo_movimentacao: fd.get("tipo_movimentacao") as "entrada" | "saida",
      forma_pagamento: fd.get("forma_pagamento") as "dinheiro" | "pix" | "cartao" | "fiado",
    }
    startTransition(async () => {
      const result = await editarExtrato(editando.id, dados)
      if (result.error) {
        toast({ title: "Erro", description: result.error, variant: "destructive" })
      } else {
        toast({ title: "Movimentação atualizada!", variant: "success" })
        setMovimentacoes((prev) => prev.map((m) => m.id === editando.id ? { ...m, ...dados } : m))
        setEditando(null)
      }
    })
  }

  function handleExcluir(id: string) {
    if (!confirm("Excluir esta movimentação?")) return
    startTransition(async () => {
      const result = await excluirExtrato(id)
      if (result.error) {
        toast({ title: "Erro", description: result.error, variant: "destructive" })
      } else {
        toast({ title: "Movimentação excluída!", variant: "success" })
        setMovimentacoes((prev) => prev.filter((m) => m.id !== id))
      }
    })
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-[var(--muted-foreground)]">Entradas</p>
                <p className="text-xl font-bold text-green-600">{formatCurrency(entradas)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <TrendingDown className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-xs text-[var(--muted-foreground)]">Saídas</p>
                <p className="text-xl font-bold text-red-600">{formatCurrency(saidas)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-[var(--muted-foreground)]">Saldo do Dia</p>
                <p className={`text-xl font-bold ${saldo >= 0 ? "text-blue-600" : "text-red-600"}`}>
                  {formatCurrency(saldo)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Movimentações de Hoje</CardTitle>
        </CardHeader>
        <CardContent>
          {movimentacoes.length === 0 ? (
            <div className="flex items-center justify-center flex-col gap-3 py-8 text-[var(--muted-foreground)]">
              <DollarSign className="w-12 h-12 opacity-30" />
              <p className="text-sm">Nenhuma movimentação registrada hoje.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {movimentacoes.map((m) => (
                <div key={m.id} className="flex items-center justify-between p-3 border border-[var(--border)] rounded-md">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${m.tipo_movimentacao === "entrada" ? "bg-green-100" : "bg-red-100"}`}>
                      {m.tipo_movimentacao === "entrada"
                        ? <TrendingUp className="w-4 h-4 text-green-600" />
                        : <TrendingDown className="w-4 h-4 text-red-600" />
                      }
                    </div>
                    <div>
                      <p className="font-medium text-sm">{m.descricao}</p>
                      <p className="text-xs text-[var(--muted-foreground)]">
                        {formatDateTime(m.data_hora)} · {FORMA_LABEL[m.forma_pagamento] ?? m.forma_pagamento}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`font-semibold ${m.tipo_movimentacao === "entrada" ? "text-green-600" : "text-red-600"}`}>
                      {m.tipo_movimentacao === "entrada" ? "+" : "-"}{formatCurrency(m.valor)}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditando(m)}
                      disabled={isPending}
                    >
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-600 hover:text-red-700"
                      onClick={() => handleExcluir(m.id)}
                      disabled={isPending}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Editar movimentação */}
      <Dialog open={!!editando} onOpenChange={(o) => { if (!o) setEditando(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Movimentação</DialogTitle>
          </DialogHeader>
          {editando && (
            <form onSubmit={handleEditar} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-descricao">Descrição *</Label>
                <Input id="edit-descricao" name="descricao" defaultValue={editando.descricao} required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-valor">Valor (R$) *</Label>
                  <Input id="edit-valor" name="valor" type="number" step="0.01" min="0.01" defaultValue={editando.valor} required />
                </div>
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select name="tipo_movimentacao" defaultValue={editando.tipo_movimentacao}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="entrada">Entrada</SelectItem>
                      <SelectItem value="saida">Saída</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Forma de Pagamento</Label>
                <Select name="forma_pagamento" defaultValue={editando.forma_pagamento}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dinheiro">Dinheiro</SelectItem>
                    <SelectItem value="pix">PIX</SelectItem>
                    <SelectItem value="cartao">Cartão</SelectItem>
                    <SelectItem value="fiado">Fiado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <Button type="button" variant="outline" onClick={() => setEditando(null)}>Cancelar</Button>
                <Button type="submit" disabled={isPending}>{isPending ? "Salvando..." : "Salvar"}</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
