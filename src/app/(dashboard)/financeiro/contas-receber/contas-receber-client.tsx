"use client"

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { ArrowDownCircle, CheckCircle, ChevronDown, ChevronRight, Pencil, Search, Trash2 } from "lucide-react"
import { formatCurrency, formatDate } from "@/lib/utils"
import { editarContaReceber, excluirContaReceber } from "@/app/actions/financeiro"
import { toast } from "@/hooks/use-toast"
import { normalizarBusca } from "@/lib/busca"
import { deCentavos, emCentavos, totalEmAbertoCentavos } from "@/lib/saldo-clientes"
import { BaixarContaDialog } from "@/components/financeiro/baixar-conta-dialog"
import type { ContaReceber, Cliente } from "@/types/database"

interface Props {
  contas: ContaReceber[]
  // Todos os clientes (inclusive arquivados): a conta de um cliente arquivado
  // continua editável sem trocar o dono — ver opcoesCliente abaixo.
  clientes: Cliente[]
}

type Grupo = {
  chave: string
  clienteId: string | null
  nome: string
  centavos: number
  contas: ContaReceber[]
}

export function ContasReceberClient({ contas, clientes }: Props) {
  const [baixando, setBaixando] = useState<ContaReceber | null>(null)
  const [editando, setEditando] = useState<ContaReceber | null>(null)
  const [clienteIdEdicao, setClienteIdEdicao] = useState("")
  const [busca, setBusca] = useState("")
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()

  const abertas = contas.filter((c) => !c.pago)
  const recebidas = contas.filter((c) => c.pago)

  // Em centavos (mesma conta das outras telas de saldo — src/lib/saldo-clientes).
  const totalAberto = deCentavos(totalEmAbertoCentavos(contas))
  const totalRecebido = deCentavos(
    recebidas.reduce((s, c) => s + emCentavos(c.valor_devido), 0)
  )

  const nomePorId = useMemo(() => new Map(clientes.map((c) => [c.id, c.nome])), [clientes])

  // Fiados em aberto agrupados por cliente (#57), do maior devedor pro menor.
  // Conta sem cliente_id (nome em branco que o backfill não ligou) agrupa
  // pelo nome em texto, pra ainda aparecer.
  const grupos = useMemo(() => {
    const mapa = new Map<string, Grupo>()
    for (const c of contas) {
      if (c.pago) continue
      const chave = c.cliente_id ?? `texto:${normalizarBusca(c.cliente.trim())}`
      const grupo = mapa.get(chave) ?? {
        chave,
        clienteId: c.cliente_id,
        nome: (c.cliente_id && nomePorId.get(c.cliente_id)) || c.cliente.trim() || "Sem nome",
        centavos: 0,
        contas: [],
      }
      grupo.centavos += emCentavos(c.valor_devido)
      grupo.contas.push(c)
      mapa.set(chave, grupo)
    }
    return [...mapa.values()].sort(
      (a, b) => b.centavos - a.centavos || a.nome.localeCompare(b.nome)
    )
  }, [contas, nomePorId])

  const termo = normalizarBusca(busca.trim())
  const gruposVisiveis = termo
    ? grupos.filter((g) => normalizarBusca(g.nome).includes(termo))
    : grupos

  function alternar(chave: string) {
    setExpandidos((prev) => {
      const novo = new Set(prev)
      if (novo.has(chave)) novo.delete(chave)
      else novo.add(chave)
      return novo
    })
  }

  // Cliente ativo, ou o dono atual da conta mesmo se arquivado: arquivar não
  // transfere nem perdoa a dívida, e editar o valor não pode obrigar a trocar
  // o dono. Outro cliente arquivado não é oferecido (o servidor também recusa).
  const opcoesCliente = editando
    ? clientes.filter((c) => c.ativo || c.id === editando.cliente_id)
    : []

  function abrirEdicao(c: ContaReceber) {
    setClienteIdEdicao(c.cliente_id ?? "")
    setEditando(c)
  }

  function handleEditar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!editando) return
    const fd = new FormData(e.currentTarget)
    const dados = {
      cliente_id: clienteIdEdicao,
      valor_devido: parseFloat(fd.get("valor_devido") as string),
      data_venda: fd.get("data_venda") as string,
      descricao: (fd.get("descricao") as string) || undefined,
    }
    startTransition(async () => {
      const result = await editarContaReceber(editando.id, dados)
      if (result.error) {
        toast({ title: "Erro", description: result.error, variant: "destructive" })
      } else {
        toast({ title: "Lançamento atualizado!", variant: "success" })
        setEditando(null)
      }
    })
  }

  function handleExcluir(id: string) {
    if (!confirm("Excluir este lançamento? Se o valor ainda for o mesmo da venda fiado original, a venda de origem também será cancelada. Se você já editou o valor, só esta conta será removida — a venda de origem continua em aberto.")) return
    startTransition(async () => {
      const result = await excluirContaReceber(id)
      if (result.error) {
        toast({ title: "Erro", description: result.error, variant: "destructive" })
      } else if (result.vendaCancelada) {
        toast({ title: "Lançamento excluído e venda de origem cancelada!", variant: "success" })
      } else {
        toast({ title: "Lançamento excluído!", variant: "success" })
      }
    })
  }

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
                <p className="text-xs text-[var(--muted-foreground)]">Total em Aberto</p>
                <p className="text-xl font-bold text-orange-600">{formatCurrency(totalAberto)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-[var(--muted-foreground)]">Total Recebido</p>
                <p className="text-xl font-bold text-green-600">{formatCurrency(totalRecebido)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-base">
            Fiados em Aberto ({abertas.length}) · {grupos.length} {grupos.length === 1 ? "cliente" : "clientes"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {abertas.length === 0 ? (
            <div className="flex items-center justify-center flex-col gap-3 py-8 text-[var(--muted-foreground)]">
              <ArrowDownCircle className="w-12 h-12 opacity-30" />
              <p className="text-sm">Nenhuma conta a receber em aberto.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="relative sm:max-w-sm">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" />
                <Input
                  className="pl-9"
                  placeholder="Buscar cliente"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  aria-label="Buscar cliente"
                />
              </div>

              {gruposVisiveis.length === 0 && (
                <p className="text-sm text-center py-6 text-[var(--muted-foreground)]">
                  Nenhum cliente com fiado em aberto encontrado.
                </p>
              )}

              {gruposVisiveis.map((g) => {
                // Buscando, mostra as contas já abertas (quem busca quer ver).
                const aberto = expandidos.has(g.chave) || termo !== ""
                return (
                  <div key={g.chave} className="border border-[var(--border)] rounded-md">
                    <div className="flex items-center justify-between gap-2 p-3">
                      <button
                        type="button"
                        onClick={() => alternar(g.chave)}
                        className="flex items-center gap-2 min-w-0 text-left flex-1"
                        aria-expanded={aberto}
                      >
                        {aberto
                          ? <ChevronDown className="w-4 h-4 shrink-0 text-[var(--muted-foreground)]" />
                          : <ChevronRight className="w-4 h-4 shrink-0 text-[var(--muted-foreground)]" />}
                        <span className="min-w-0">
                          <span className="block font-medium text-sm truncate">{g.nome}</span>
                          <span className="block text-xs text-[var(--muted-foreground)]">
                            {g.contas.length} {g.contas.length === 1 ? "conta" : "contas"}
                          </span>
                        </span>
                      </button>
                      <div className="flex items-center gap-3 shrink-0">
                        {g.clienteId && (
                          <Link
                            href={`/cadastros/clientes/${g.clienteId}`}
                            className="text-xs text-[var(--primary)] underline"
                          >
                            Ver cliente
                          </Link>
                        )}
                        <span className="font-bold text-orange-600">{formatCurrency(deCentavos(g.centavos))}</span>
                      </div>
                    </div>

                    {aberto && (
                      <div className="space-y-2 px-3 pb-3 border-t border-[var(--border)] pt-3">
                        {g.contas.map((c) => (
                          <div key={c.id} className="flex items-center justify-between gap-2 p-3 border border-[var(--border)] rounded-md">
                            <div className="min-w-0">
                              <p className="text-xs text-[var(--muted-foreground)]">
                                {formatDate(c.data_venda)}{c.descricao ? ` · ${c.descricao}` : ""}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="font-semibold text-orange-600">{formatCurrency(c.valor_devido)}</span>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => abrirEdicao(c)}
                                disabled={isPending}
                                aria-label="Editar lançamento"
                              >
                                <Pencil className="w-3 h-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-red-600 hover:text-red-700"
                                onClick={() => handleExcluir(c.id)}
                                disabled={isPending}
                                aria-label="Excluir lançamento"
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1"
                                onClick={() => setBaixando(c)}
                              >
                                <CheckCircle className="w-3 h-3" /> Receber
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {recebidas.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-[var(--muted-foreground)]">Recebidos ({recebidas.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recebidas.map((c) => (
                <div key={c.id} className="flex items-center justify-between p-3 border border-[var(--border)] rounded-md opacity-60">
                  <div>
                    <p className="font-medium text-sm line-through">{c.cliente}</p>
                    <p className="text-xs text-[var(--muted-foreground)]">{formatDate(c.data_venda)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold">{formatCurrency(c.valor_devido)}</span>
                    <Badge variant="secondary">Recebido</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <BaixarContaDialog key={baixando?.id ?? "fechado"} conta={baixando} onClose={() => setBaixando(null)} />

      <Dialog open={!!editando} onOpenChange={(o) => { if (!o) setEditando(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Lançamento</DialogTitle>
          </DialogHeader>
          {editando && (
            <form onSubmit={handleEditar} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-cliente">Cliente *</Label>
                <Select value={clienteIdEdicao} onValueChange={setClienteIdEdicao}>
                  <SelectTrigger id="edit-cliente">
                    <SelectValue placeholder="Escolha o cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {opcoesCliente.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome}{c.ativo ? "" : " (arquivado)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!editando.cliente_id && (
                  <p className="text-xs text-amber-700">
                    Esta conta ainda não está ligada a um cliente cadastrado ({editando.cliente || "sem nome"}). Escolha o cliente para ligá-la.
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-valor">Valor (R$) *</Label>
                  <Input id="edit-valor" name="valor_devido" type="number" step="0.01" min="0.01" defaultValue={editando.valor_devido} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-data">Data *</Label>
                  <Input id="edit-data" name="data_venda" type="date" defaultValue={editando.data_venda} required />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-descricao">Descrição</Label>
                <Input id="edit-descricao" name="descricao" defaultValue={editando.descricao ?? ""} placeholder="Descrição opcional" />
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <Button type="button" variant="outline" onClick={() => setEditando(null)}>Cancelar</Button>
                <Button type="submit" disabled={isPending || !clienteIdEdicao}>{isPending ? "Salvando..." : "Salvar"}</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
