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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Plus, ShoppingCart, Minus, CheckCircle, UtensilsCrossed } from "lucide-react"
import Link from "next/link"
import { cn, formatCurrency, formatDateTime } from "@/lib/utils"
import { criarVenda, cancelarVenda } from "@/app/actions/vendas"
import type { VendaComItens, ItemVenda } from "@/app/actions/vendas"
import { toast } from "@/hooks/use-toast"
import type { Item, FormaPagamento } from "@/types/database"

interface Props {
  vendas: VendaComItens[]
  itensDisponiveis: Item[]
}

const FORMAS_PAGAMENTO: { value: FormaPagamento; label: string }[] = [
  { value: "dinheiro", label: "Dinheiro" },
  { value: "pix", label: "PIX" },
  { value: "cartao", label: "Cartão" },
  { value: "fiado", label: "Fiado" },
]

const STATUS_LABEL: Record<string, string> = {
  pago: "Pago",
  pendente: "Fiado",
  cancelado: "Cancelado",
}

type BadgeVariant = "default" | "secondary" | "destructive" | "outline" | "success" | "warning"
const STATUS_VARIANT: Record<string, BadgeVariant> = {
  pago: "default",
  pendente: "warning",
  cancelado: "destructive",
}

interface CarrinhoItem {
  item_id: string
  nome: string
  quantidade: number
  valor_unitario: number
}

export function VendasClient({ vendas, itensDisponiveis }: Props) {
  const [open, setOpen] = useState(false)
  const [carrinho, setCarrinho] = useState<CarrinhoItem[]>([])
  const [cliente, setCliente] = useState("")
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamento>("dinheiro")
  const [desconto, setDesconto] = useState(0)
  const [isPending, startTransition] = useTransition()
  const [filtroForma, setFiltroForma] = useState<FormaPagamento | "todos">("todos")

  const totalBruto = carrinho.reduce((s, i) => s + i.quantidade * i.valor_unitario, 0)
  const totalLiquido = Math.max(0, totalBruto - desconto)

  function addItem(item: Item) {
    setCarrinho((prev) => {
      const existe = prev.find((c) => c.item_id === item.id)
      if (existe) {
        return prev.map((c) =>
          c.item_id === item.id ? { ...c, quantidade: c.quantidade + 1 } : c
        )
      }
      return [...prev, { item_id: item.id, nome: item.nome, quantidade: 1, valor_unitario: item.preco }]
    })
  }

  function removeItem(item_id: string) {
    setCarrinho((prev) => {
      const existe = prev.find((c) => c.item_id === item_id)
      if (existe && existe.quantidade > 1) {
        return prev.map((c) =>
          c.item_id === item_id ? { ...c, quantidade: c.quantidade - 1 } : c
        )
      }
      return prev.filter((c) => c.item_id !== item_id)
    })
  }

  function abrirNova() {
    setCarrinho([])
    setCliente("")
    setFormaPagamento("dinheiro")
    setDesconto(0)
    setOpen(true)
  }

  function handleSubmit() {
    if (carrinho.length === 0) {
      toast({ title: "Carrinho vazio", description: "Adicione ao menos um item", variant: "destructive" })
      return
    }

    const itens: ItemVenda[] = carrinho.map((c) => ({
      item_id: c.item_id,
      nome: c.nome,
      quantidade: c.quantidade,
      valor_unitario: c.valor_unitario,
    }))

    startTransition(async () => {
      const result = await criarVenda({ cliente, forma_pagamento: formaPagamento, desconto, itens })
      if (result.error) {
        toast({ title: "Erro", description: result.error, variant: "destructive" })
      } else {
        toast({ title: "Venda registrada!", variant: "success" })
        setOpen(false)
      }
    })
  }

  function handleCancelar(id: string) {
    if (!confirm("Cancelar esta venda?")) return
    startTransition(async () => {
      const result = await cancelarVenda(id)
      if (result.error) {
        toast({ title: "Erro", description: result.error, variant: "destructive" })
      } else {
        toast({ title: "Venda cancelada", variant: "success" })
      }
    })
  }

  // Total vendido no dia independe da forma de pagamento — inclui fiado
  // ainda pendente. Só venda cancelada não conta como venda de verdade.
  const vendasFiltradas = filtroForma === "todos"
    ? vendas
    : vendas.filter((v) => v.forma_pagamento === filtroForma)

  const totalDia = vendasFiltradas
    .filter((v) => v.status !== "cancelado")
    .reduce((s, v) => s + v.total, 0)

  return (
    <>
      {itensDisponiveis.length === 0 && (
        <div className="flex items-center gap-3 mb-4 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
          <UtensilsCrossed className="w-5 h-5 shrink-0" />
          <span>
            Nenhum produto no cardápio de hoje — as vendas ficam bloqueadas até você{" "}
            <Link href="/cadastros/cardapio" className="font-semibold underline">
              configurar o cardápio do dia
            </Link>
            .
          </span>
        </div>
      )}

      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="bg-white border border-[var(--border)] rounded-md px-4 py-2">
            <p className="text-xs text-[var(--muted-foreground)]">
              {filtroForma === "todos" ? "Total do dia" : `Total em ${FORMAS_PAGAMENTO.find((f) => f.value === filtroForma)?.label}`}
            </p>
            <p className="text-lg font-bold text-green-600">{formatCurrency(totalDia)}</p>
          </div>
          <Select value={filtroForma} onValueChange={(v) => setFiltroForma(v as FormaPagamento | "todos")}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas as formas</SelectItem>
              {FORMAS_PAGAMENTO.map((f) => (
                <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button size="lg" className="gap-2" onClick={abrirNova}>
          <Plus className="w-5 h-5" />
          Nova Venda
        </Button>
      </div>

      <div className="space-y-3">
        {vendasFiltradas.length === 0 ? (
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-center flex-col gap-3 py-12 text-[var(--muted-foreground)]">
                <ShoppingCart className="w-12 h-12 opacity-30" />
                <p className="text-sm">
                  {vendas.length === 0 ? "Nenhuma venda registrada hoje." : "Nenhuma venda com essa forma de pagamento hoje."}
                </p>
                <p className="text-xs">Clique em &quot;Nova Venda&quot; para começar.</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          vendasFiltradas.map((v) => (
            <Card key={v.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold text-sm">
                        #{v.numero_pedido} · {v.cliente || "Venda avulsa"}
                      </p>
                      <Badge variant={STATUS_VARIANT[v.status] ?? "secondary"}>
                        {STATUS_LABEL[v.status] ?? v.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-[var(--muted-foreground)] mb-2">
                      {formatDateTime(v.data_hora)} · {FORMAS_PAGAMENTO.find((f) => f.value === v.forma_pagamento)?.label}
                    </p>
                    <div className="text-xs text-[var(--muted-foreground)] space-y-0.5">
                      {v.tab_vendas_itens.map((item, i) => (
                        <div key={i}>
                          {item.quantidade}x {item.tab_itens?.nome} — {formatCurrency(item.subtotal)}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={cn(
                      "font-bold",
                      v.status === "cancelado"
                        ? "text-[var(--muted-foreground)] line-through"
                        : "text-[var(--primary)]"
                    )}>
                      {formatCurrency(v.total)}
                    </p>
                    {v.status !== "cancelado" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-xs text-red-500 hover:text-red-700 mt-1"
                        onClick={() => handleCancelar(v.id)}
                        disabled={isPending}
                      >
                        Cancelar
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova Venda</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Cliente (opcional)</Label>
                <Input
                  placeholder="Nome do cliente"
                  value={cliente}
                  onChange={(e) => setCliente(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Forma de Pagamento</Label>
                <Select value={formaPagamento} onValueChange={(v) => setFormaPagamento(v as FormaPagamento)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FORMAS_PAGAMENTO.map((f) => (
                      <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="mb-2 block">Produtos</Label>
              {itensDisponiveis.length === 0 ? (
                <p className="text-sm text-[var(--muted-foreground)] py-4 text-center">
                  Nenhum produto disponível.{" "}
                  <Link href="/cadastros/cardapio" className="text-[var(--primary)] underline">
                    Configure o cardápio do dia
                  </Link>{" "}
                  primeiro.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {itensDisponiveis.map((item) => {
                    const noCarrinho = carrinho.find((c) => c.item_id === item.id)
                    return (
                      <div
                        key={item.id}
                        className="flex items-center justify-between border border-[var(--border)] rounded-md px-3 py-2"
                      >
                        <div>
                          <p className="text-sm font-medium">{item.nome}</p>
                          <p className="text-xs text-[var(--primary)]">{formatCurrency(item.preco)}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          {noCarrinho ? (
                            <>
                              <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => removeItem(item.id)}>
                                <Minus className="w-3 h-3" />
                              </Button>
                              <span className="text-sm font-bold w-5 text-center">{noCarrinho.quantidade}</span>
                              <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => addItem(item)}>
                                <Plus className="w-3 h-3" />
                              </Button>
                            </>
                          ) : (
                            <Button size="sm" variant="outline" onClick={() => addItem(item)}>
                              <Plus className="w-3 h-3 mr-1" /> Add
                            </Button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {carrinho.length > 0 && (
              <div className="border border-[var(--border)] rounded-md p-3 space-y-2">
                <p className="text-sm font-semibold">Resumo</p>
                {carrinho.map((item) => (
                  <div key={item.item_id} className="flex justify-between text-sm">
                    <span>{item.quantidade}x {item.nome}</span>
                    <span>{formatCurrency(item.quantidade * item.valor_unitario)}</span>
                  </div>
                ))}
                <div className="border-t border-[var(--border)] pt-2 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>Subtotal</span>
                    <span>{formatCurrency(totalBruto)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm gap-2">
                    <span>Desconto (R$)</span>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      className="w-24 h-7 text-sm"
                      value={desconto || ""}
                      onChange={(e) => setDesconto(parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div className="flex justify-between font-bold">
                    <span>Total</span>
                    <span className="text-[var(--primary)]">{formatCurrency(totalLiquido)}</span>
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-2 justify-end pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSubmit} disabled={isPending || carrinho.length === 0} className="gap-2">
                <CheckCircle className="w-4 h-4" />
                {isPending ? "Registrando..." : `Finalizar — ${formatCurrency(totalLiquido)}`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
