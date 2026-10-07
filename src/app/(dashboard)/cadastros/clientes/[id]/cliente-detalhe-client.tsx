"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CheckCircle, Phone } from "lucide-react"
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils"
import { deCentavos, totalEmAbertoCentavos } from "@/lib/saldo-clientes"
import { BaixarContaDialog } from "@/components/financeiro/baixar-conta-dialog"
import { LIMITE_RECEBIDAS_DETALHE } from "@/lib/contas-receber"
import type { DetalheCliente } from "@/app/actions/clientes"
import type { ContaReceber } from "@/types/database"

const FORMA_LABEL: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  cartao: "Cartão",
  fiado: "Fiado",
}

const STATUS_LABEL: Record<string, string> = {
  pago: "Pago",
  pendente: "Fiado",
  cancelado: "Cancelado",
}

export function ClienteDetalheClient({ detalhe }: { detalhe: DetalheCliente }) {
  const { cliente, contas, compras } = detalhe
  const [baixando, setBaixando] = useState<ContaReceber | null>(null)

  const abertas = contas.filter((c) => !c.pago)
  const recebidas = contas.filter((c) => c.pago)
  // Mesma conta das outras telas de saldo (src/lib/saldo-clientes).
  const emAberto = deCentavos(totalEmAbertoCentavos(contas))

  return (
    <>
      <Card className="mb-4">
        <CardContent className="p-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs text-[var(--muted-foreground)]">Em aberto</p>
            <p className={`text-3xl font-bold ${emAberto > 0 ? "text-red-600" : "text-green-600"}`}>
              {formatCurrency(emAberto)}
            </p>
            <p className="text-xs text-[var(--muted-foreground)] mt-1">
              {abertas.length === 0
                ? "Sem dívida"
                : `${abertas.length} ${abertas.length === 1 ? "conta" : "contas"} em aberto`}
            </p>
          </div>
          <div className="text-sm text-[var(--muted-foreground)] space-y-1">
            {cliente.telefone && (
              <p className="flex items-center gap-2">
                <Phone className="w-4 h-4" />
                {cliente.telefone}
              </p>
            )}
            {!cliente.ativo && <Badge variant="secondary">Arquivado</Badge>}
          </div>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-base">Fiado em aberto ({abertas.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {abertas.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)] py-4 text-center">
              Nenhuma conta em aberto.
            </p>
          ) : (
            <div className="space-y-2">
              {abertas.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-2 p-3 border border-[var(--border)] rounded-md"
                >
                  <p className="text-xs text-[var(--muted-foreground)] min-w-0">
                    {formatDate(c.data_venda)}{c.descricao ? ` · ${c.descricao}` : ""}
                  </p>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-semibold text-orange-600">{formatCurrency(c.valor_devido)}</span>
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => setBaixando(c)}>
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
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-base text-[var(--muted-foreground)]">
              Já recebido ({recebidas.length}
              {recebidas.length >= LIMITE_RECEBIDAS_DETALHE ? `, só os ${LIMITE_RECEBIDAS_DETALHE} mais recentes` : ""})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recebidas.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-2 p-3 border border-[var(--border)] rounded-md opacity-70"
                >
                  <p className="text-xs text-[var(--muted-foreground)]">
                    {formatDate(c.data_venda)}
                    {c.data_baixa ? ` · recebido em ${formatDate(c.data_baixa)}` : ""}
                    {c.forma_pagamento_baixa ? ` (${FORMA_LABEL[c.forma_pagamento_baixa] ?? c.forma_pagamento_baixa})` : ""}
                  </p>
                  <span className="font-semibold">{formatCurrency(c.valor_devido)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Compras recentes</CardTitle>
        </CardHeader>
        <CardContent>
          {compras.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)] py-4 text-center">
              Nenhuma compra registrada para este cliente.
            </p>
          ) : (
            <div className="space-y-2">
              {compras.map((v) => (
                <div
                  key={v.id}
                  className="flex items-center justify-between gap-2 p-3 border border-[var(--border)] rounded-md"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      #{v.numero_pedido}{" "}
                      <Badge variant={v.status === "cancelado" ? "destructive" : v.status === "pendente" ? "warning" : "default"}>
                        {STATUS_LABEL[v.status] ?? v.status}
                      </Badge>
                    </p>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {formatDateTime(v.data_hora)} · {FORMA_LABEL[v.forma_pagamento] ?? v.forma_pagamento}
                    </p>
                  </div>
                  <span className={`font-semibold shrink-0 ${v.status === "cancelado" ? "line-through text-[var(--muted-foreground)]" : ""}`}>
                    {formatCurrency(v.total)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <BaixarContaDialog key={baixando?.id ?? "fechado"} conta={baixando} onClose={() => setBaixando(null)} />
    </>
  )
}
