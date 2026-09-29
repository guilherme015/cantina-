"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Calendar, Package, Save, Copy, ChevronLeft, ChevronRight, History } from "lucide-react"
import { formatCurrency, formatDate } from "@/lib/utils"
import {
  getCardapioPorData,
  salvarCardapioPorData,
  copiarUltimoCardapio,
  listarHistoricoCardapios,
  type CardapioHistoricoItem,
} from "@/app/actions/cardapio"
import { toast } from "@/hooks/use-toast"
import type { Item } from "@/types/database"

interface Props {
  produtos: Item[]
  dataInicial: string
  idsIniciais: string[]
}

// Soma/subtrai dias numa data "YYYY-MM-DD" sem depender do fuso do
// navegador — usa Date.UTC pra tratar a string só como um valor de
// calendário, não como um instante (diferente do "hoje" que precisa vir de
// hojeBR(), essa é aritmética pura sobre uma data que o servidor já deu).
function addDias(data: string, n: number): string {
  const [ano, mes, dia] = data.split("-").map(Number)
  const d = new Date(Date.UTC(ano, mes - 1, dia))
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().split("T")[0]
}

export function CardapioClient({ produtos, dataInicial, idsIniciais }: Props) {
  const [dataSelecionada, setDataSelecionada] = useState(dataInicial)
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set(idsIniciais))
  const [carregando, setCarregando] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [historicoAberto, setHistoricoAberto] = useState(false)
  const [historico, setHistorico] = useState<CardapioHistoricoItem[] | null>(null)
  const [carregandoHistorico, setCarregandoHistorico] = useState(false)

  const hoje = dataInicial
  const isHoje = dataSelecionada === hoje

  async function irPara(novaData: string) {
    if (novaData === dataSelecionada) return
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
      const result = await salvarCardapioPorData(dataSelecionada, Array.from(selecionados))
      if (result.error) {
        toast({ title: "Erro", description: result.error, variant: "destructive" })
      } else {
        toast({
          title: "Cardápio salvo!",
          description: `${selecionados.size} produto(s) para ${formatDate(dataSelecionada)}`,
          variant: "success",
        })
        setHistorico(null)
      }
    })
  }

  function handleCopiarUltimo() {
    // Sobrescreve tudo que já estiver selecionado (aqui ou salvo por outro
    // membro) — confirma antes pra não perder uma seleção em andamento sem
    // querer.
    if (selecionados.size > 0 && !confirm(`Isso substitui os ${selecionados.size} produto(s) já selecionados hoje. Continuar?`)) {
      return
    }
    startTransition(async () => {
      const result = await copiarUltimoCardapio()
      if (result.error) {
        toast({ title: "Não deu pra copiar", description: result.error, variant: "destructive" })
      } else {
        setSelecionados(new Set(result.itemIds))
        toast({ title: "Cardápio copiado!", description: `${result.itemIds?.length ?? 0} produto(s) disponíveis hoje`, variant: "success" })
      }
    })
  }

  function abrirHistorico() {
    setHistoricoAberto(true)
    if (historico === null) {
      setCarregandoHistorico(true)
      listarHistoricoCardapios().then((h) => {
        setHistorico(h)
        setCarregandoHistorico(false)
      })
    }
  }

  const ativos = produtos.filter((p) => p.ativo)

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <button
          onClick={() => irPara(addDias(dataSelecionada, -1))}
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
            onChange={(e) => e.target.value && irPara(e.target.value)}
            className="w-40 h-8 text-sm"
            disabled={carregando}
          />
          {isHoje ? (
            <span className="text-xs bg-[var(--primary)] text-white px-2 py-0.5 rounded-full">Hoje</span>
          ) : (
            <button
              onClick={() => irPara(hoje)}
              className="text-xs text-[var(--primary)] underline underline-offset-2 hover:opacity-70"
              disabled={carregando}
            >
              Ir para hoje
            </button>
          )}
        </div>

        <button
          onClick={() => irPara(addDias(dataSelecionada, 1))}
          className="p-1.5 rounded-md border border-[var(--border)] hover:bg-[var(--secondary)] transition-colors"
          disabled={carregando}
          aria-label="Próximo dia"
        >
          <ChevronRight className="w-4 h-4" />
        </button>

        <button
          onClick={abrirHistorico}
          className="flex items-center gap-1 text-xs text-[var(--muted-foreground)] hover:text-[var(--primary)] ml-1"
        >
          <History className="w-3.5 h-3.5" />
          Histórico
        </button>
      </div>

      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <div className="bg-white border border-[var(--border)] rounded-md px-4 py-2">
          <p className="text-xs text-[var(--muted-foreground)]">Selecionados — {formatDate(dataSelecionada)}</p>
          <p className="text-lg font-bold text-[var(--primary)]">{selecionados.size} produto(s)</p>
        </div>
        <div className="flex gap-2">
          {isHoje && (
            <Button variant="outline" className="gap-2" onClick={handleCopiarUltimo} disabled={isPending || carregando}>
              <Copy className="w-4 h-4" />
              Copiar último cardápio
            </Button>
          )}
          <Button size="lg" className="gap-2" onClick={handleSalvar} disabled={isPending || carregando}>
            <Save className="w-5 h-5" />
            {isPending ? "Salvando..." : "Salvar Cardápio"}
          </Button>
        </div>
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

      <Dialog open={historicoAberto} onOpenChange={setHistoricoAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Histórico de cardápios</DialogTitle>
          </DialogHeader>
          {carregandoHistorico ? (
            <p className="text-sm text-[var(--muted-foreground)] py-4">Carregando...</p>
          ) : !historico || historico.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)] py-4">Nenhum cardápio salvo ainda.</p>
          ) : (
            <div className="max-h-80 overflow-y-auto space-y-1">
              {historico.map((h) => (
                <button
                  key={h.data}
                  onClick={() => {
                    setHistoricoAberto(false)
                    irPara(h.data)
                  }}
                  className={`w-full flex justify-between items-center px-3 py-2 rounded-md text-sm hover:bg-[var(--secondary)] transition-colors ${
                    h.data === dataSelecionada ? "bg-[var(--primary)]/10 text-[var(--primary)]" : ""
                  }`}
                >
                  <span>
                    {formatDate(h.data)}
                    {h.data === hoje ? " (hoje)" : ""}
                  </span>
                  <span className="text-xs text-[var(--muted-foreground)]">{h.totalItens} produto(s)</span>
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
