import { Header } from "@/components/layout/header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TrendingUp, TrendingDown, DollarSign } from "lucide-react"
import { formatCurrency, formatDateTime } from "@/lib/utils"
import { listarExtrato } from "@/app/actions/financeiro"
import type { ExtratoFinanceiro } from "@/types/database"

const FORMA_LABEL: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  cartao: "Cartão",
  fiado: "Fiado",
}

export default async function ExtratoPage() {
  const movimentacoes: ExtratoFinanceiro[] = await listarExtrato()

  const entradas = movimentacoes.filter((m) => m.tipo_movimentacao === "entrada").reduce((s, m) => s + m.valor, 0)
  const saidas = movimentacoes.filter((m) => m.tipo_movimentacao === "saida").reduce((s, m) => s + m.valor, 0)
  const saldo = entradas - saidas

  return (
    <div>
      <Header title="Extrato Financeiro" description="Acompanhe todas as movimentações do caixa" />

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
                  <span className={`font-semibold ${m.tipo_movimentacao === "entrada" ? "text-green-600" : "text-red-600"}`}>
                    {m.tipo_movimentacao === "entrada" ? "+" : "-"}{formatCurrency(m.valor)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
