"use client"

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
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
import { Plus, Users, Pencil, Archive, ArchiveRestore, Search } from "lucide-react"
import {
  criarCliente,
  editarCliente,
  arquivarCliente,
  reativarCliente,
} from "@/app/actions/clientes"
import { toast } from "@/hooks/use-toast"
import { formatCurrency } from "@/lib/utils"
import { deCentavos } from "@/lib/saldo-clientes"
import { normalizarBusca as normalizar } from "@/lib/busca"
import type { Cliente } from "@/types/database"

interface Props {
  clientes: Cliente[]
  // Saldo devedor em centavos por cliente_id (só contas em aberto).
  saldos: Record<string, number>
}

export function ClientesClient({ clientes, saldos }: Props) {
  const [open, setOpen] = useState(false)
  const [editando, setEditando] = useState<Cliente | null>(null)
  const [busca, setBusca] = useState("")
  const [mostrarArquivados, setMostrarArquivados] = useState(false)
  const [isPending, startTransition] = useTransition()

  const totalArquivados = clientes.filter((c) => !c.ativo).length

  const visiveis = useMemo(() => {
    const termo = normalizar(busca.trim())
    return clientes.filter((c) => {
      if (!mostrarArquivados && !c.ativo) return false
      if (!termo) return true
      return (
        normalizar(c.nome).includes(termo) ||
        normalizar(c.telefone ?? "").includes(termo)
      )
    })
  }, [clientes, busca, mostrarArquivados])

  function abrirNovo() {
    setEditando(null)
    setOpen(true)
  }

  function abrirEdicao(c: Cliente) {
    setEditando(c)
    setOpen(true)
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)

    startTransition(async () => {
      const result = editando
        ? await editarCliente(editando.id, formData)
        : await criarCliente(formData)

      if (result.error) {
        toast({ title: "Erro", description: result.error, variant: "destructive" })
      } else {
        toast({ title: editando ? "Cliente atualizado!" : "Cliente cadastrado!", variant: "success" })
        setOpen(false)
      }
    })
  }

  function handleAtivo(c: Cliente) {
    startTransition(async () => {
      const result = c.ativo ? await arquivarCliente(c.id) : await reativarCliente(c.id)
      if (result.error) {
        toast({ title: "Erro", description: result.error, variant: "destructive" })
      } else {
        toast({ title: c.ativo ? "Cliente arquivado" : "Cliente reativado", variant: "success" })
      }
    })
  }

  return (
    <>
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between mb-4">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" />
          <Input
            className="pl-9"
            placeholder="Buscar por nome ou telefone"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            aria-label="Buscar cliente"
          />
        </div>
        <Button size="lg" className="gap-2" onClick={abrirNovo}>
          <Plus className="w-5 h-5" />
          Novo Cliente
        </Button>
      </div>

      {totalArquivados > 0 && (
        <label className="flex items-center gap-2 text-sm text-[var(--muted-foreground)] mb-4 cursor-pointer w-fit">
          <input
            type="checkbox"
            checked={mostrarArquivados}
            onChange={(e) => setMostrarArquivados(e.target.checked)}
            className="w-4 h-4"
          />
          Mostrar arquivados ({totalArquivados})
        </label>
      )}

      {clientes.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-center flex-col gap-3 py-12 text-[var(--muted-foreground)]">
              <Users className="w-12 h-12 opacity-30" />
              <p className="text-sm">Nenhum cliente cadastrado.</p>
              <p className="text-xs">Clique em &quot;Novo Cliente&quot; para adicionar.</p>
            </div>
          </CardContent>
        </Card>
      ) : visiveis.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-center py-8 text-[var(--muted-foreground)]">
              Nenhum cliente encontrado.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {visiveis.map((c) => (
            <Card key={c.id} className={c.ativo ? undefined : "opacity-70"}>
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 shrink-0 rounded-lg bg-[var(--secondary)] flex items-center justify-center">
                    <Users className="w-5 h-5 text-[var(--muted-foreground)]" />
                  </div>
                  <Link
                    href={`/cadastros/clientes/${c.id}`}
                    className="min-w-0 hover:underline"
                    title="Ver dívidas e histórico"
                  >
                    <p className="font-medium text-sm truncate">{c.nome}</p>
                    {c.telefone && (
                      <p className="text-xs text-[var(--muted-foreground)] truncate">{c.telefone}</p>
                    )}
                  </Link>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {(saldos[c.id] ?? 0) > 0 && (
                    <Badge variant="destructive" title="Fiado em aberto">
                      Deve {formatCurrency(deCentavos(saldos[c.id]))}
                    </Badge>
                  )}
                  {!c.ativo && <Badge variant="secondary">Arquivado</Badge>}
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => abrirEdicao(c)}
                    disabled={isPending}
                    title="Editar"
                    aria-label={`Editar ${c.nome}`}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleAtivo(c)}
                    disabled={isPending}
                    title={c.ativo ? "Arquivar" : "Reativar"}
                    aria-label={`${c.ativo ? "Arquivar" : "Reativar"} ${c.nome}`}
                  >
                    {c.ativo
                      ? <Archive className="w-4 h-4" />
                      : <ArchiveRestore className="w-4 h-4 text-green-600" />
                    }
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editando ? "Editar Cliente" : "Novo Cliente"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome *</Label>
              <Input
                id="nome"
                name="nome"
                defaultValue={editando?.nome ?? ""}
                placeholder="Ex: Maria Silva"
                maxLength={100}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="telefone">Telefone (opcional)</Label>
              <Input
                id="telefone"
                name="telefone"
                type="tel"
                defaultValue={editando?.telefone ?? ""}
                placeholder="(00) 00000-0000"
                maxLength={30}
              />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
