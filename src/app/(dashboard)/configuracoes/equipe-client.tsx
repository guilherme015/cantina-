"use client"

import { useState, useTransition } from "react"
import { Copy, Trash2, UserPlus, Users } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { formatDate } from "@/lib/utils"
import { ROTULO_PAPEL, type Papel } from "@/lib/papel"
import {
  alterarPapelMembro,
  criarConvite,
  removerMembro,
  revogarConvite,
  type ConviteAberto,
  type Membro,
} from "@/app/actions/membros"
import { toast } from "@/hooks/use-toast"

interface Props {
  membros: Membro[]
  convites: ConviteAberto[]
}

const PAPEIS: Papel[] = ["operador", "admin"]

export function EquipeClient({ membros, convites }: Props) {
  const [isPending, startTransition] = useTransition()
  const [papelConvite, setPapelConvite] = useState<Papel>("operador")
  // O token só existe em texto logo depois de criado (o banco guarda só o
  // hash) — some se a pessoa recarregar a página; aí é revogar e gerar outro.
  const [linkGerado, setLinkGerado] = useState<string | null>(null)

  function executar(acao: () => Promise<{ error?: string }>, sucesso: string) {
    startTransition(async () => {
      const result = await acao()
      if (result.error) {
        toast({ title: "Erro", description: result.error, variant: "destructive" })
      } else {
        toast({ title: sucesso, variant: "success" })
      }
    })
  }

  function handleGerarConvite() {
    startTransition(async () => {
      const result = await criarConvite(papelConvite)
      if (result.error || !result.token) {
        toast({ title: "Erro", description: result.error ?? "Não foi possível gerar o convite.", variant: "destructive" })
        return
      }
      setLinkGerado(`${window.location.origin}/login?convite=${result.token}`)
    })
  }

  async function handleCopiar() {
    if (!linkGerado) return
    try {
      await navigator.clipboard.writeText(linkGerado)
      toast({ title: "Link copiado!", variant: "success" })
    } catch {
      toast({ title: "Não foi possível copiar", description: "Selecione o link e copie à mão.", variant: "destructive" })
    }
  }

  function handleRemover(m: Membro) {
    if (!confirm(`Remover ${m.email ?? "este membro"} da equipe? A pessoa perde o acesso na hora.`)) return
    executar(() => removerMembro(m.user_id), "Membro removido")
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Equipe</CardTitle>
          <CardDescription>
            Administrador faz tudo. Operador registra vendas e dá baixa em fiado — não cancela venda,
            não mexe em Contas a Pagar, produtos, cardápio nem fecha o caixa.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {membros.length === 0 ? (
            <div className="flex items-center justify-center flex-col gap-3 py-8 text-[var(--muted-foreground)]">
              <Users className="w-12 h-12 opacity-30" />
              <p className="text-sm">Nenhum membro.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {membros.map((m) => (
                <div
                  key={m.user_id}
                  className="flex items-center justify-between gap-3 p-3 border border-[var(--border)] rounded-md"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">
                      {m.email ?? "(sem e-mail registrado)"}
                      {m.eu && <span className="text-[var(--muted-foreground)] font-normal"> · você</span>}
                    </p>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      Entrou em {formatDate(m.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Select
                      value={m.papel}
                      onValueChange={(novo) =>
                        executar(() => alterarPapelMembro(m.user_id, novo), "Papel atualizado")
                      }
                      disabled={isPending}
                    >
                      <SelectTrigger className="w-[150px] h-9" aria-label={`Papel de ${m.email ?? "membro"}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAPEIS.map((p) => (
                          <SelectItem key={p} value={p}>
                            {ROTULO_PAPEL[p]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {!m.eu && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => handleRemover(m)}
                        disabled={isPending}
                        title="Remover da equipe"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Convidar pessoa</CardTitle>
          <CardDescription>
            Gere um link de uso único (vale 7 dias) e mande para a pessoa. Ela cria a conta pelo
            link e já entra na sua igreja com o papel escolhido. O link só vale para e-mails que
            ainda não têm conta.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={papelConvite} onValueChange={(v) => setPapelConvite(v as Papel)} disabled={isPending}>
              <SelectTrigger className="w-[170px]" aria-label="Papel do convidado">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAPEIS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {ROTULO_PAPEL[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleGerarConvite} disabled={isPending} className="gap-2">
              <UserPlus className="w-4 h-4" />
              Gerar link de convite
            </Button>
          </div>

          {linkGerado && (
            <div className="p-3 rounded-md bg-[var(--secondary)] space-y-2">
              <p className="text-xs text-[var(--muted-foreground)]">
                Copie agora — por segurança o link não aparece de novo. Se perder, revogue e gere outro.
              </p>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={linkGerado}
                  onFocus={(e) => e.currentTarget.select()}
                  aria-label="Link de convite"
                  className="flex-1 min-w-0 h-9 px-3 rounded-md border border-[var(--border)] bg-white text-xs"
                />
                <Button size="sm" variant="outline" onClick={handleCopiar} className="gap-1">
                  <Copy className="w-3 h-3" /> Copiar
                </Button>
              </div>
            </div>
          )}

          {convites.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Convites em aberto ({convites.length})</p>
              {convites.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-3 p-3 border border-[var(--border)] rounded-md"
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{ROTULO_PAPEL[c.papel]}</Badge>
                    <span className="text-xs text-[var(--muted-foreground)]">
                      criado em {formatDate(c.created_at)} · expira em {formatDate(c.expira_em)}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600 hover:text-red-700"
                    onClick={() => executar(() => revogarConvite(c.id), "Convite revogado")}
                    disabled={isPending}
                  >
                    Revogar
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
