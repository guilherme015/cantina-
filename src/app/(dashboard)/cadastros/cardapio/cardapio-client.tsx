"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Calendar, Package, Save, ChevronLeft, ChevronRight } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import { getCardapioPorData, salvarCardapio } from "@/app/actions/cardapio"
import { toast } from "@/hooks/use-toast"
import type { Item } from "@/types/database"

interface Props {
  produtos: Item[]
  dataInicial: string
  idsIniciais: string[]
}

function formatarDataBr(iso: string) {
  const [y, m, d] = iso.split("-")
  return `${d}/${m}/${y}`
}

function addDias(iso: string, n: number) {
  const d = new Date(iso + "T12:00:00")
  d.setDate(d.getDate() + n)
  return d.toISOString().split("T")[0]
}

export function CardapioClient({ produtos, dataInicial, idsIniciais }: Props) {
  const [dataSelecionada, setDataSelecionada] = useState(dataInicial)
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set(idsIniciais))
  const [carregando, setCarregando] = useState(false)
  const [isPending, startTransition] = useTransition()

  const hoje = dataInicial

  async function mudarData(novaData: string) {
    setCarregando(true)
    setDataSelecionada(novaData)
    const cardapio = await getCardapioPorData(novaData)
    setSelecionados(new Set(cardapio?.item_ids ?? []))
    setCarregando(false)
  }

  function toggleItem(id: string) {
    setSelecionados((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleSalvar() {
    startTransition(async () => {
      const result = await salvarCardapio(dataSelecionada, Array.from(selecionados))
      if (result.error) {
        toast({ title: "Erro", description: result.error, variant: "destructive" })
      } else {
        toast({
          title: "Cardápio salvo!",
          description: `${selecionados.size} produto(s) para ${formatarDataBr(dataSelecionada)}`,
          variant: "success",
        })
      }
    })
  }

  const ativos = produtos.filter((p) => p.ativo)
  const isHoje = dataSelecionada === hoje

  return (
    <>
      {/* Date selector */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={() => mudarData(addDias(dataSelecionada, -1))}
          className="p-1.5 rounded-md border border-[var(--border)] hover:bg-[var(--secondary)] transition-colors"
          disabled={carregando}
          aria-label="Dia anterior"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-[var(--muted-foreground)]" />
          <Input
            type="date"
            value={dataSelecionada}
            onChange={(e) => e.target.value && mudarData(e.target.value)}
            className="w-40 h-8 text-sm"
            disabled={carregando}
          />
          {isHoje && (
            <span className="text-xs bg-[var(--primary)] text-white px-2 py-0.5 rounded-full">Hoje</span>
          )}
          {!isHoje && (
            <button
              onClick={() => mudarData(hoje)}
              className="text-xs text-[var(--primary)] underline underline-offset-2 hover:opacity-70"
              disabled={carregando}
            >
              Ir para hoje
            </button>
          )}
        </div>

        <button
          onClick={() => mudarData(addDias(dataSelecionada, 1))}
          className="p-1.5 rounded-md border border-[var(--border)] hover:bg-[var(--secondary)] transition-colors"
          disabled={carregando}
          aria-label="Próximo dia"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="flex justify-between items-center mb-4">
        <div className="bg-white border border-[var(--border)] rounded-md px-4 py-2">
          <p className="text-xs text-[var(--muted-foreground)]">Selecionados — {formatarDataBr(dataSelecionada)}</p>
          <p className="text-lg font-bold text-[var(--primary)]">{selecionados.size} produto(s)</p>
        </div>
        <Button size="lg" className="gap-2" onClick={handleSalvar} disabled={isPending || carregando}>
          <Save className="w-5 h-5" />
          {isPending ? "Salvando..." : "Salvar Cardápio"}
        </Button>
      </div>

      {ativos.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-center flex-col gap-3 py-12 text-[var(--muted-foreground)]">
              <Calendar className="w-12 h-12 opacity-30" />
              <p className="text-sm">Nenhum produto ativo cadastrado.</p>
              <p className="text-xs">Cadastre produtos primeiro em &quot;Produtos&quot;.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className={`space-y-2 transition-opacity ${carregando ? "opacity-50 pointer-events-none" : ""}`}>
          {ativos.map((p) => {
            const sel = selecionados.has(p.id)
            return (
              <Card
                key={p.id}
                className={`cursor-pointer transition-colors ${sel ? "border-[var(--primary)] bg-[var(--primary)]/5" : ""}`}
                onClick={() => toggleItem(p.id)}
              >
                <CardContent className="p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${sel ? "bg-[var(--primary)]" : "bg-[var(--secondary)]"}`}>
                      <Package className={`w-5 h-5 ${sel ? "text-white" : "text-[var(--muted-foreground)]"}`} />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{p.nome}</p>
                      <p className="text-[var(--primary)] font-semibold text-sm">{formatCurrency(p.preco)}</p>
                    </div>
                  </div>
                  <Badge variant={sel ? "default" : "secondary"}>
                    {sel ? "No cardápio" : "Fora do cardápio"}
                  </Badge>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </>
  )
}
