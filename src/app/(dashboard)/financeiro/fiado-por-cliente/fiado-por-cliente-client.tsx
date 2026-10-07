"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowDownCircle, ChevronRight, Users } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { formatCurrency } from "@/lib/utils"
import { deCentavos } from "@/lib/saldo-clientes"

export type LinhaFiado = {
  // null = contas sem cliente cadastrado (linha agregada).
  clienteId: string | null
  nome: string
  telefone: string | null
  arquivado: boolean
  centavos: number
  contas: number
}

interface Props {
  linhas: LinhaFiado[]
  // Total geral em aberto — o MESMO número do "Total em Aberto" de Contas a
  // Receber (vem da soma de todas as contas abertas, não da soma das linhas
  // visíveis, que muda com o filtro).
  totalCentavos: number
}

export function FiadoPorClienteClient({ linhas, totalCentavos }: Props) {
  const [soComDivida, setSoComDivida] = useState(true)

  const devedores = linhas.filter((l) => l.centavos > 0).length
  const visiveis = soComDivida ? linhas.filter((l) => l.centavos > 0) : linhas

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
                <p className="text-xs text-[var(--muted-foreground)]">Total em aberto</p>
                <p className="text-xl font-bold text-orange-600">{formatCurrency(deCentavos(totalCentavos))}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[var(--secondary)] flex items-center justify-center">
                <Users className="w-5 h-5 text-[var(--muted-foreground)]" />
              </div>
              <div>
                <p className="text-xs text-[var(--muted-foreground)]">Clientes devendo</p>
                <p className="text-xl font-bold">{devedores}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <label className="flex items-center gap-2 text-sm text-[var(--muted-foreground)] mb-4 cursor-pointer w-fit">
        <input
          type="checkbox"
          checked={soComDivida}
          onChange={(e) => setSoComDivida(e.target.checked)}
          className="w-4 h-4"
        />
        Só quem tem dívida
      </label>

      {visiveis.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-center flex-col gap-3 py-12 text-[var(--muted-foreground)]">
              <Users className="w-12 h-12 opacity-30" />
              <p className="text-sm">
                {soComDivida ? "Nenhum cliente com fiado em aberto." : "Nenhum cliente cadastrado."}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {visiveis.map((l) => {
            const href = l.clienteId ? `/cadastros/clientes/${l.clienteId}` : "/financeiro/contas-receber"
            return (
              <Link key={l.clienteId ?? "sem-cliente"} href={href} className="block">
                <Card className="hover:bg-[var(--secondary)] transition-colors">
                  <CardContent className="p-4 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">
                        {l.nome}{" "}
                        {l.arquivado && <Badge variant="secondary">Arquivado</Badge>}
                      </p>
                      <p className="text-xs text-[var(--muted-foreground)] truncate">
                        {l.contas > 0
                          ? `${l.contas} ${l.contas === 1 ? "conta" : "contas"} em aberto`
                          : "Sem dívida"}
                        {l.telefone ? ` · ${l.telefone}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`font-bold ${l.centavos > 0 ? "text-red-600" : "text-[var(--muted-foreground)]"}`}>
                        {formatCurrency(deCentavos(l.centavos))}
                      </span>
                      <ChevronRight className="w-4 h-4 text-[var(--muted-foreground)]" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </>
  )
}
