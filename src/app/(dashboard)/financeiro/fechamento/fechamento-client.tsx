"use client"

import { useMemo, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { CheckCircle, Lock, LockOpen, TrendingUp, TrendingDown } from "lucide-react"
import { formatCurrency, formatDate } from "@/lib/utils"
import { fecharCaixa, reabrirCaixa, type ResumoDia } from "@/app/actions/fechamento"
import { toast } from "@/hooks/use-toast"
import type { FechamentoCaixa } from "@/types/database"

interface Props {
  resumoInicial: ResumoDia | null
  fechamentos: FechamentoCaixa[]
}

export function FechamentoClient({ resumoInicial, fechamentos }: Props) {
  const [saldoInicial, setSaldoInicial] = useState("0")
  const [valorInformado, setValorInformado] = useState("")
  const [observacoes, setObservacoes] = useState("")
  const [isPending, startTransition] = useTransition()
  const [reabrirFechamento, setReabrirFechamento] = useState<FechamentoCaixa | null>(null)
  const [justificativa, setJustificativa] = useState("")
  const [isReabrindo, startReabrirTransition] = useTransition()

  const fechamentoHoje = resumoInicial
    ? fechamentos.find((f) => f.data === resumoInicial.data)
    : undefined

  const valorCalculado = useMemo(() => {
    if (!resumoInicial) return 0
    const inicial = parseFloat(saldoInicial) || 0
    return inicial + resumoInicial.entradasDinheiro - resumoInicial.totalSaidas
  }, [resumoInicial, saldoInicial])

  function handleFechar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!resumoInicial) return
    const informado = parseFloat(valorInformado)
    if (isNaN(informado) || informado < 0) {
      toast({ title: "Erro", description: "Informe o valor contado no caixa", variant: "destructive" })
      return
    }
    startTransition(async () => {
      const result = await fecharCaixa({
        data: resumoInicial.data,
        saldoInicial: parseFloat(saldoInicial) || 0,
        valorInformado: informado,
        observacoes: observacoes || undefined,
      })
      if (result.error) {
        toast({ title: "Erro", description: result.error, variant: "destructive" })
      } else {
        toast({ title: "Caixa fechado!", variant: "success" })
      }
    })
  }

  function handleReabrir() {
    if (!reabrirFechamento) return
    if (!justificativa.trim()) {
      toast({ title: "Erro", description: "Informe a justificativa para reabrir o caixa", variant: "destructive" })
      return
    }
    startReabrirTransition(async () => {
      const result = await reabrirCaixa(reabrirFechamento.data, justificativa)
      if (result.error) {
        toast({ title: "Erro", description: result.error, variant: "destructive" })
      } else {
        toast({ title: "Caixa reaberto", variant: "success" })
        // O formulário de fechar reaparece (fechamentoHoje deixa de existir) —
        // preenche o saldo inicial com o do fechamento desfeito, em vez de
        // deixar o "0" padrão, e limpa valor contado/observações antigos
        // (ficavam pendurados no estado do último fechamento da sessão).
        setSaldoInicial(String(reabrirFechamento.saldo_inicial))
        setValorInformado("")
        setObservacoes("")
        setReabrirFechamento(null)
        setJustificativa("")
      }
    })
  }

  if (!resumoInicial) {
    return <p className="text-sm text-[var(--muted-foreground)]">Não foi possível carregar o resumo do dia.</p>
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-[var(--muted-foreground)]">Entradas de Hoje</p>
                <p className="text-xl font-bold text-green-600">{formatCurrency(resumoInicial.totalEntradas)}</p>
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
                <p className="text-xs text-[var(--muted-foreground)]">Saídas de Hoje</p>
                <p className="text-xl font-bold text-red-600">{formatCurrency(resumoInicial.totalSaidas)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <p className="text-xs text-[var(--muted-foreground)] mb-1">Entradas por forma de pagamento</p>
            <div className="text-sm space-y-0.5">
              <p>Dinheiro: <span className="font-semibold">{formatCurrency(resumoInicial.entradasDinheiro)}</span></p>
              <p>PIX: <span className="font-semibold">{formatCurrency(resumoInicial.entradasPix)}</span></p>
              <p>Cartão: <span className="font-semibold">{formatCurrency(resumoInicial.entradasCartao)}</span></p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {fechamentoHoje ? "Caixa de hoje já fechado" : `Fechar caixa de ${formatDate(resumoInicial.data)}`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {fechamentoHoje ? (
            <div className="flex items-center gap-3 text-[var(--muted-foreground)]">
              <Lock className="w-5 h-5" />
              <div className="text-sm">
                <p>Valor calculado: <span className="font-semibold">{formatCurrency(fechamentoHoje.valor_calculado)}</span></p>
                <p>Valor informado: <span className="font-semibold">{formatCurrency(fechamentoHoje.valor_informado)}</span></p>
                <p>
                  Diferença:{" "}
                  <span className={`font-semibold ${fechamentoHoje.diferenca === 0 ? "" : fechamentoHoje.diferenca > 0 ? "text-green-600" : "text-red-600"}`}>
                    {formatCurrency(fechamentoHoje.diferenca)}
                  </span>
                </p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleFechar} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="saldo-inicial">Saldo Inicial do Caixa (R$)</Label>
                  <Input
                    id="saldo-inicial"
                    type="number"
                    step="0.01"
                    min="0"
                    value={saldoInicial}
                    onChange={(e) => setSaldoInicial(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="valor-informado">Valor Contado no Caixa (R$) *</Label>
                  <Input
                    id="valor-informado"
                    type="number"
                    step="0.01"
                    min="0"
                    value={valorInformado}
                    onChange={(e) => setValorInformado(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="bg-[var(--secondary)] rounded-md p-3 text-sm">
                Valor calculado (saldo inicial + entradas em dinheiro − saídas): <span className="font-semibold">{formatCurrency(valorCalculado)}</span>
              </div>
              <div className="space-y-2">
                <Label htmlFor="observacoes">Observações</Label>
                <Input id="observacoes" value={observacoes} onChange={(e) => setObservacoes(e.target.value)} placeholder="Opcional" />
              </div>
              <Button type="submit" disabled={isPending} className="gap-2">
                <CheckCircle className="w-4 h-4" />
                {isPending ? "Fechando..." : "Fechar Caixa"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico de Fechamentos</CardTitle>
        </CardHeader>
        <CardContent>
          {fechamentos.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)] py-4 text-center">Nenhum fechamento registrado ainda.</p>
          ) : (
            <div className="space-y-2">
              {fechamentos.map((f) => (
                <div key={f.id} className="flex items-center justify-between p-3 border border-[var(--border)] rounded-md">
                  <div>
                    <p className="font-medium text-sm">{formatDate(f.data)}</p>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      Calculado {formatCurrency(f.valor_calculado)} · Informado {formatCurrency(f.valor_informado)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={f.diferenca === 0 ? "secondary" : "destructive"}>
                      Diferença {formatCurrency(f.diferenca)}
                    </Badge>
                    {f.data === resumoInicial.data && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => setReabrirFechamento(f)}
                      >
                        <LockOpen className="w-3.5 h-3.5" />
                        Reabrir
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={reabrirFechamento !== null} onOpenChange={(open) => !open && setReabrirFechamento(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reabrir caixa de hoje ({reabrirFechamento ? formatDate(reabrirFechamento.data) : ""})</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-[var(--muted-foreground)]">
              Só é possível reabrir o caixa de hoje. O fechamento será apagado e o dia volta a aceitar vendas e lançamentos. Essa ação é registrada com a justificativa abaixo — não é possível desfazer a reabertura em si.
            </p>
            <div className="space-y-2">
              <Label htmlFor="justificativa">Justificativa *</Label>
              <Textarea
                id="justificativa"
                value={justificativa}
                onChange={(e) => setJustificativa(e.target.value)}
                placeholder="Por que este fechamento está sendo reaberto?"
                required
              />
            </div>
            <Button type="button" onClick={handleReabrir} disabled={isReabrindo} className="gap-2">
              <LockOpen className="w-4 h-4" />
              {isReabrindo ? "Reabrindo..." : "Confirmar reabertura"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
