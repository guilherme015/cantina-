"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Calendar, Package, Save, Copy } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import { salvarCardapioHoje, copiarUltimoCardapio } from "@/app/actions/cardapio"
import { toast } from "@/hooks/use-toast"
import type { Item } from "@/types/database"

interface Props {
  produtos: Item[]
  idsHoje: string[]
}

export function CardapioClient({ produtos, idsHoje }: Props) {
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set(idsHoje))
  const [isPending, startTransition] = useTransition()

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
      const result = await salvarCardapioHoje(Array.from(selecionados))
      if (result.error) {
        toast({ title: "Erro", description: result.error, variant: "destructive" })
      } else {
        toast({ title: "Cardápio salvo!", description: `${selecionados.size} produto(s) disponíveis hoje`, variant: "success" })
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

  const ativos = produtos.filter((p) => p.ativo)

  return (
    <>
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <div className="bg-white border border-[var(--border)] rounded-md px-4 py-2">
          <p className="text-xs text-[var(--muted-foreground)]">Selecionados hoje</p>
          <p className="text-lg font-bold text-[var(--primary)]">{selecionados.size} produto(s)</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={handleCopiarUltimo} disabled={isPending}>
            <Copy className="w-4 h-4" />
            Copiar último cardápio
          </Button>
          <Button size="lg" className="gap-2" onClick={handleSalvar} disabled={isPending}>
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
        <div className="space-y-2">
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
