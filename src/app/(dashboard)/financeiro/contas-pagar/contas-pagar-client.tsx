"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Plus, ArrowUpCircle, CheckCircle, Pencil, Trash2 } from "lucide-react"
import { formatCurrency, formatDate } from "@/lib/utils"
import { criarContaPagar, pagarConta, editarContaPagar, excluirContaPagar } from "@/app/actions/financeiro"
import { toast } from "@/hooks/use-toast"
import type { ContaPagar } from "@/types/database"

interface Props {
  contas: ContaPagar[]
}

export function ContasPagarClient({ contas }: Props) {
  const [open, setOpen] = useState(false)
  const [editando, setEditando] = useState<ContaPagar | null>(null)
  const [isPending, startTransition] = useTransition()

  const totalAberto = contas.filter((c) => !c.pago).reduce((s, c) => s + c.valor, 0)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await criarContaPagar(formData)
      if (result.error) {
        toast({ title: "Erro", description: result.error, variant: "destructive" })
      } else {
        toast({ title: "Despesa registrada!", variant: "success" })
        setOpen(false)
      }
    })
  }

  function handleEditar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!editando) return
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await editarContaPagar(editando.id, formData)
      if (result.error) {
        toast({ title: "Erro", description: result.error, variant: "destructive" })
      } else {
        toast({ title: "Despesa atualizada!", variant: "success" })
        setEditando(null)
      }
    })
  }

  function handlePagar(id: string) {
    if (!confirm("Marcar como paga?")) return
    startTransition(async () => {
      const result = await pagarConta(id)
      if (result.error) {
        toast({ title: "Erro", description: result.error, variant: "destructive" })
      } else {
        toast({ title: "Conta marcada como paga!", variant: "success" })
      }
    })
  }

  function handleExcluir(id: string) {
    if (!confirm("Excluir este lançamento?")) return
    startTransition(async () => {
      const result = await excluirContaPagar(id)
      if (result.error) {
        toast({ title: "Erro", description: result.error, variant: "destructive" })
      } else {
        toast({ title: "Lançamento excluído!", variant: "success" })
      }
    })
  }

  const abertas = contas.filter((c) => !c.pago)
  const pagas = contas.filter((c) => c.pago)

  return (
    <>
      <div className="flex justify-between items-center mb-4">
        <div className="bg-white border border-[var(--border)] rounded-md px-4 py-2">
          <p className="text-xs text-[var(--muted-foreground)]">Total em Aberto</p>
          <p className="text-lg font-bold text-red-600">{formatCurrency(totalAberto)}</p>
        </div>
        <Button size="lg" className="gap-2" onClick={() => setOpen(true)}>
          <Plus className="w-5 h-5" />
          Nova Despesa
        </Button>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Em Aberto ({abertas.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {abertas.length === 0 ? (
              <div className="flex items-center justify-center flex-col gap-3 py-8 text-[var(--muted-foreground)]">
                <ArrowUpCircle className="w-12 h-12 opacity-30" />
                <p className="text-sm">Nenhuma despesa em aberto.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {abertas.map((c) => (
                  <div key={c.id} className="flex items-center justify-between p-3 border border-[var(--border)] rounded-md">
                    <div>
                      <p className="font-medium text-sm">{c.descricao}</p>
                      <p className="text-xs text-[var(--muted-foreground)]">
                        {formatDate(c.data)}{c.categoria ? ` · ${c.categoria}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-red-600">{formatCurrency(c.valor)}</span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        onClick={() => setEditando(c)}
                        disabled={isPending}
                      >
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 text-red-600 hover:text-red-700"
                        onClick={() => handleExcluir(c.id)}
                        disabled={isPending}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        onClick={() => handlePagar(c.id)}
                        disabled={isPending}
                      >
                        <CheckCircle className="w-3 h-3" /> Pagar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {pagas.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base text-[var(--muted-foreground)]">Pagas ({pagas.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {pagas.map((c) => (
                  <div key={c.id} className="flex items-center justify-between p-3 border border-[var(--border)] rounded-md opacity-60">
                    <div>
                      <p className="font-medium text-sm line-through">{c.descricao}</p>
                      <p className="text-xs text-[var(--muted-foreground)]">{formatDate(c.data)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{formatCurrency(c.valor)}</span>
                      <Badge variant="secondary">Paga</Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 text-red-600 hover:text-red-700"
                        onClick={() => handleExcluir(c.id)}
                        disabled={isPending}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Nova Despesa */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Despesa</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="descricao">Descrição *</Label>
              <Input id="descricao" name="descricao" placeholder="Ex: Compra de ingredientes" required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="valor">Valor (R$) *</Label>
                <Input id="valor" name="valor" type="number" step="0.01" min="0.01" placeholder="0,00" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="data">Data *</Label>
                <Input id="data" name="data" type="date" defaultValue={new Date().toISOString().split("T")[0]} required />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="categoria">Categoria</Label>
              <Input id="categoria" name="categoria" placeholder="Ex: Ingredientes, Aluguel..." />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={isPending}>{isPending ? "Salvando..." : "Salvar"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Editar Despesa */}
      <Dialog open={!!editando} onOpenChange={(o) => { if (!o) setEditando(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Despesa</DialogTitle>
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
                  <Label htmlFor="edit-data">Data *</Label>
                  <Input id="edit-data" name="data" type="date" defaultValue={editando.data} required />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-categoria">Categoria</Label>
                <Input id="edit-categoria" name="categoria" defaultValue={editando.categoria ?? ""} placeholder="Ex: Ingredientes, Aluguel..." />
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
