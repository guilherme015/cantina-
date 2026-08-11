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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ArrowDownCircle, CheckCircle, Pencil, Trash2 } from "lucide-react"
import { formatCurrency, formatDate } from "@/lib/utils"
import { baixarContaReceber, editarContaReceber, excluirContaReceber } from "@/app/actions/financeiro"
import { toast } from "@/hooks/use-toast"
import type { ContaReceber } from "@/types/database"

interface Props {
  contas: ContaReceber[]
}

export function ContasReceberClient({ contas }: Props) {
  const [baixando, setBaixando] = useState<ContaReceber | null>(null)
  const [editando, setEditando] = useState<ContaReceber | null>(null)
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

  function handleEditar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!editando) return
    const fd = new FormData(e.currentTarget)
    const dados = {
      cliente: fd.get("cliente") as string,
      valor_devido: parseFloat(fd.get("valor_devido") as string),
      data_venda: fd.get("data_venda") as string,
      descricao: (fd.get("descricao") as string) || undefined,
    }
    startTransition(async () => {
      const result = await editarContaReceber(editando.id, dados)
      if (result.error) {
        toast({ title: "Erro", description: result.error, variant: "destructive" })
      } else {
        toast({ title: "Lançamento atualizado!", variant: "success" })
        setEditando(null)
      }
    })
  }

  function handleExcluir(id: string) {
    if (!confirm("Excluir este lançamento?")) return
    startTransition(async () => {
      const result = await excluirContaReceber(id)
      if (result.error) {
        toast({ title: "Erro", description: result.error, variant: "destructive" })
      } else {
        toast({ title: "Lançamento excluído!", variant: "success" })
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
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-orange-600">{formatCurrency(c.valor_devido)}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditando(c)}
                      disabled={isPending}
                    >
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-600 hover:text-red-700"
                      onClick={() => handleExcluir(c.id)}
                      disabled={isPending}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
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
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{formatCurrency(c.valor_devido)}</span>
                    <Badge variant="secondary">Recebido</Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-600 hover:text-red-700"
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

      {/* Registrar Recebimento */}
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

      {/* Editar lançamento */}
      <Dialog open={!!editando} onOpenChange={(o) => { if (!o) setEditando(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Lançamento</DialogTitle>
          </DialogHeader>
          {editando && (
            <form onSubmit={handleEditar} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-cliente">Cliente *</Label>
                <Input id="edit-cliente" name="cliente" defaultValue={editando.cliente} required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-valor">Valor (R$) *</Label>
                  <Input id="edit-valor" name="valor_devido" type="number" step="0.01" min="0.01" defaultValue={editando.valor_devido} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-data">Data *</Label>
                  <Input id="edit-data" name="data_venda" type="date" defaultValue={editando.data_venda} required />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-descricao">Descrição</Label>
                <Input id="edit-descricao" name="descricao" defaultValue={editando.descricao ?? ""} placeholder="Descrição opcional" />
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
