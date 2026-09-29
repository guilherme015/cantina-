"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { TrendingUp, TrendingDown, DollarSign } from "lucide-react"
import { formatCurrency, formatDateTime } from "@/lib/utils"
import type { ExtratoFinanceiro, FormaPagamento } from "@/types/database"

const FORMA_LABEL: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  cartao: "Cartão",
  fiado: "Fiado",
}

// Sem "fiado" de propósito: diferente de Vendas (onde fiado é uma forma
// de venda de verdade), no Extrato nenhuma linha grava forma_pagamento
// "fiado" — a venda fiado só entra aqui quando é recebida, com a forma
// de pagamento real usada na baixa (dinheiro/pix/cartão). O filtro
// ficaria sempre vazio.
const FORMAS_PAGAMENTO: { value: FormaPagamento; label: string }[] = [
  { value: "dinheiro", label: "Dinheiro" },
  { value: "pix", label: "PIX" },
  { value: "cartao", label: "Cartão" },
]

interface Props {
  movimentacoes: ExtratoFinanceiro[]
}

export function ExtratoClient({ movimentacoes }: Props) {
  const [filtroForma, setFiltroForma] = useState<FormaPagamento | "todos">("todos")

  const movimentacoesFiltradas = filtroForma === "todos"
    ? movimentacoes
    : movimentacoes.filter((m) => m.forma_pagamento === filtroForma)

  const entradas = movimentacoesFiltradas.filter((m) => m.tipo_movimentacao === "entrada").reduce((s, m) => s + m.valor, 0)
  const saidas = movimentacoesFiltradas.filter((m) => m.tipo_movimentacao === "saida").reduce((s, m) => s + m.valor, 0)
  const saldo = entradas - saidas

  // Com filtro ativo, os cards precisam deixar claro que não são mais
  // o total do dia — sem isso, "Saídas" filtrado por PIX sempre mostra
  // R$ 0,00 (toda saída é gravada como dinheiro) e alguém lendo o card
  // sem notar o filtro ligado leria isso como o caixa do dia inteiro.
  const sufixo = filtroForma === "todos" ? "" : ` (${FORMA_LABEL[filtroForma]})`

  return (
    <>
      <div className="flex justify-end mb-4">
        <Select value={filtroForma} onValueChange={(v) => setFiltroForma(v as FormaPagamento | "todos")}>
          <SelectTrigger className="w-48">
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-[var(--muted-foreground)]">Entradas{sufixo}</p>
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
                <p className="text-xs text-[var(--muted-foreground)]">Saídas{sufixo}</p>
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
                <p className="text-xs text-[var(--muted-foreground)]">Saldo do Dia{sufixo}</p>
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
          <CardTitle className="text-base">
            {filtroForma === "todos" ? "Movimentações de Hoje" : `Movimentações em ${FORMA_LABEL[filtroForma]}`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {movimentacoesFiltradas.length === 0 ? (
            <div className="flex items-center justify-center flex-col gap-3 py-8 text-[var(--muted-foreground)]">
              <DollarSign className="w-12 h-12 opacity-30" />
              <p className="text-sm">
                {movimentacoes.length === 0 ? "Nenhuma movimentação registrada hoje." : "Nenhuma movimentação com essa forma de pagamento hoje."}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {movimentacoesFiltradas.map((m) => (
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
                  <span className={`font-semibold ${m.tipo_movimentacao === "entrada" ? "text-green-600" : "text-red-600"}`}>
                    {m.tipo_movimentacao === "entrada" ? "+" : "-"}{formatCurrency(m.valor)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}
