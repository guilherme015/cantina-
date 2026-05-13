"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Plus, Package, Pencil, ToggleLeft, ToggleRight, Trash2 } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import { criarProduto, atualizarProduto, toggleProdutoAtivo, excluirProduto } from "@/app/actions/produtos"
import { toast } from "@/hooks/use-toast"
import type { Item } from "@/types/database"

interface Props {
  produtos: Item[]
}

export function ProdutosClient({ produtos }: Props) {
  const [open, setOpen] = useState(false)
  const [editando, setEditando] = useState<Item | null>(null)
  const [isPending, startTransition] = useTransition()

  function abrirNovo() {
    setEditando(null)
    setOpen(true)
  }

  function abrirEdicao(p: Item) {
    setEditando(p)
    setOpen(true)
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const formData = new FormData(form)

    startTransition(async () => {
      const result = editando
        ? await atualizarProduto(editando.id, formData)
        : await criarProduto(formData)

      if (result.error) {
        toast({ title: "Erro", description: result.error, variant: "destructive" })
      } else {
        toast({ title: editando ? "Produto atualizado!" : "Produto criado!", variant: "success" })
        setOpen(false)
      }
    })
  }

  function handleToggle(p: Item) {
    startTransition(async () => {
      const result = await toggleProdutoAtivo(p.id, !p.ativo)
      if (result.error) {
        toast({ title: "Erro", description: result.error, variant: "destructive" })
      } else {
        toast({ title: p.ativo ? "Produto desativado" : "Produto ativado", variant: "success" })
      }
    })
  }

  function handleExcluir(p: Item) {
    if (!confirm(`Excluir "${p.nome}"?`)) return
    startTransition(async () => {
      const result = await excluirProduto(p.id)
      if (result.error) {
        toast({ title: "Erro", description: result.error, variant: "destructive" })
      } else {
        toast({ title: "Produto excluído", variant: "success" })
      }
    })
  }

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button size="lg" className="gap-2" onClick={abrirNovo}>
          <Plus className="w-5 h-5" />
          Novo Produto
        </Button>
      </div>

      {produtos.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-center flex-col gap-3 py-12 text-[var(--muted-foreground)]">
              <Package className="w-12 h-12 opacity-30" />
              <p className="text-sm">Nenhum produto cadastrado.</p>
              <p className="text-xs">Clique em &quot;Novo Produto&quot; para adicionar.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {produtos.map((p) => (
            <Card key={p.id}>
              <CardContent className="p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[var(--secondary)] flex items-center justify-center">
                    <Package className="w-5 h-5 text-[var(--muted-foreground)]" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{p.nome}</p>
                    <p className="text-[var(--primary)] font-semibold text-sm">{formatCurrency(p.preco)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={p.ativo ? "default" : "secondary"}>
                    {p.ativo ? "Ativo" : "Inativo"}
                  </Badge>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleToggle(p)}
                    disabled={isPending}
                    title={p.ativo ? "Desativar" : "Ativar"}
                  >
                    {p.ativo
                      ? <ToggleRight className="w-5 h-5 text-green-600" />
                      : <ToggleLeft className="w-5 h-5 text-[var(--muted-foreground)]" />
                    }
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => abrirEdicao(p)}
                    disabled={isPending}
                    title="Editar"
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleExcluir(p)}
                    disabled={isPending}
                    title="Excluir"
                    className="hover:text-red-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editando ? "Editar Produto" : "Novo Produto"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome *</Label>
              <Input
                id="nome"
                name="nome"
                defaultValue={editando?.nome ?? ""}
                placeholder="Ex: Salgado de frango"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="preco">Preço (R$) *</Label>
              <Input
                id="preco"
                name="preco"
                type="number"
                step="0.01"
                min="0.01"
                defaultValue={editando?.preco ?? ""}
                placeholder="0,00"
                required
              />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
