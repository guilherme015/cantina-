"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Plus, Search, UserRound, X } from "lucide-react"
import { criarCliente } from "@/app/actions/clientes"
import { normalizarBusca } from "@/lib/busca"
import { toast } from "@/hooks/use-toast"
import type { Cliente } from "@/types/database"

interface Props {
  // Só clientes ATIVOS: a tela não oferece arquivado (o servidor também
  // recusa).
  clientes: Cliente[]
  value: Cliente | null
  onChange: (cliente: Cliente | null) => void
  disabled?: boolean
}

const MAX_RESULTADOS = 6

// Busca de cliente com "cadastrar na hora" (Nova Venda, #56): digita o
// nome, escolhe na lista ou cria só pelo nome sem sair da venda. O nome
// oficial gravado na venda vem do cadastro no servidor, não daqui.
export function SeletorCliente({ clientes, value, onChange, disabled }: Props) {
  const [busca, setBusca] = useState("")
  const [aberto, setAberto] = useState(false)
  const [isPending, startTransition] = useTransition()
  const raiz = useRef<HTMLDivElement>(null)

  // Fecha a lista ao tocar fora (sem onBlur, que fecharia antes do clique
  // no item chegar).
  useEffect(() => {
    if (!aberto) return
    function fora(e: MouseEvent | TouchEvent) {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener("mousedown", fora)
    document.addEventListener("touchstart", fora)
    return () => {
      document.removeEventListener("mousedown", fora)
      document.removeEventListener("touchstart", fora)
    }
  }, [aberto])

  const termo = normalizarBusca(busca.trim())

  const resultados = useMemo(() => {
    const filtrados = termo
      ? clientes.filter(
          (c) =>
            normalizarBusca(c.nome).includes(termo) ||
            normalizarBusca(c.telefone ?? "").includes(termo)
        )
      : clientes
    return filtrados.slice(0, MAX_RESULTADOS)
  }, [clientes, termo])

  const totalFiltrados = useMemo(
    () =>
      termo
        ? clientes.filter(
            (c) =>
              normalizarBusca(c.nome).includes(termo) ||
              normalizarBusca(c.telefone ?? "").includes(termo)
          ).length
        : clientes.length,
    [clientes, termo]
  )

  // Já existe alguém com esse nome (sem acento/caixa)? Então não oferece
  // cadastrar de novo — evita "jose" ao lado de "José".
  const jaExiste = clientes.some((c) => normalizarBusca(c.nome.trim()) === termo)
  const podeCadastrar = busca.trim() !== "" && !jaExiste

  function escolher(c: Cliente) {
    onChange(c)
    setBusca("")
    setAberto(false)
  }

  function cadastrar() {
    const formData = new FormData()
    formData.set("nome", busca)
    startTransition(async () => {
      const result = await criarCliente(formData)
      if (result.error || !result.cliente) {
        toast({ title: "Erro", description: result.error ?? "Não foi possível cadastrar", variant: "destructive" })
        return
      }
      toast({ title: "Cliente cadastrado!", variant: "success" })
      escolher(result.cliente)
    })
  }

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 border border-[var(--border)] rounded-md px-3 h-10 bg-[var(--secondary)]">
        <span className="flex items-center gap-2 min-w-0 text-sm font-medium">
          <UserRound className="w-4 h-4 shrink-0 text-[var(--muted-foreground)]" />
          <span className="truncate">{value.nome}</span>
        </span>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-7 w-7 shrink-0"
          onClick={() => onChange(null)}
          disabled={disabled}
          title="Trocar cliente"
          aria-label="Trocar cliente"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
    )
  }

  return (
    <div ref={raiz} className="space-y-2">
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" />
        <Input
          className="pl-9"
          placeholder="Buscar ou cadastrar cliente"
          value={busca}
          onChange={(e) => { setBusca(e.target.value); setAberto(true) }}
          onFocus={() => setAberto(true)}
          onKeyDown={(e) => {
            // Enter dentro do diálogo não pode submeter nada nem cadastrar
            // sem querer; Esc só fecha a lista.
            if (e.key === "Enter") e.preventDefault()
            if (e.key === "Escape") setAberto(false)
          }}
          disabled={disabled || isPending}
          maxLength={100}
          aria-label="Buscar cliente"
          autoComplete="off"
        />
      </div>

      {aberto && (
        <div className="border border-[var(--border)] rounded-md max-h-52 overflow-y-auto bg-white">
          {resultados.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => escolher(c)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--secondary)]"
            >
              <span className="truncate">{c.nome}</span>
              {c.telefone && (
                <span className="shrink-0 text-xs text-[var(--muted-foreground)]">{c.telefone}</span>
              )}
            </button>
          ))}

          {totalFiltrados > resultados.length && (
            <p className="px-3 py-1.5 text-xs text-[var(--muted-foreground)]">
              +{totalFiltrados - resultados.length} — continue digitando para filtrar
            </p>
          )}

          {podeCadastrar && (
            <button
              type="button"
              onClick={cadastrar}
              disabled={isPending}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-[var(--primary)] hover:bg-[var(--secondary)] border-t border-[var(--border)] first:border-t-0"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span className="truncate">
                {isPending ? "Cadastrando..." : `Cadastrar "${busca.trim()}"`}
              </span>
            </button>
          )}

          {resultados.length === 0 && !podeCadastrar && (
            <p className="px-3 py-2 text-sm text-[var(--muted-foreground)]">
              {clientes.length === 0 ? "Nenhum cliente cadastrado. Digite o nome para cadastrar." : "Nenhum cliente encontrado."}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
