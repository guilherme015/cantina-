"use server"

import { revalidatePath } from "next/cache"
import { mensagemDeErro } from "@/lib/erros"
import { getUsuarioEIgreja } from "@/lib/auth-contexto"
import { MENSAGEM_SO_ADMIN, ehPapel } from "@/lib/papel"
import type { Papel } from "@/types/database"

export type Membro = {
  user_id: string
  email: string | null
  papel: Papel
  created_at: string
  eu: boolean
}

export type ConviteAberto = {
  id: string
  papel: Papel
  created_at: string
  expira_em: string
}

// Só admin enxerga a equipe: a RLS de igreja_convites já esconde os convites
// do operador, mas a lista de membros (igreja_membros) é legível por todos da
// igreja — a tela de gestão é que é só do admin.
export async function listarEquipe(): Promise<{ membros: Membro[]; convites: ConviteAberto[] } | null> {
  const { supabase, user, igrejaId, papel } = await getUsuarioEIgreja()
  if (!user || !igrejaId || papel !== "admin") return null

  const [{ data: membros }, { data: convites }] = await Promise.all([
    supabase
      .from("igreja_membros")
      .select("user_id, email, papel, created_at")
      .eq("igreja_id", igrejaId)
      .order("created_at", { ascending: true }),
    supabase
      .from("igreja_convites")
      .select("id, papel, created_at, expira_em")
      .eq("igreja_id", igrejaId)
      .is("usado_em", null)
      .gt("expira_em", new Date().toISOString())
      .order("created_at", { ascending: false }),
  ])

  return {
    membros: (membros ?? []).map((m) => ({
      user_id: m.user_id,
      email: m.email,
      papel: m.papel,
      created_at: m.created_at ?? "",
      eu: m.user_id === user.id,
    })),
    convites: (convites ?? []).map((c) => ({
      id: c.id,
      papel: c.papel,
      created_at: c.created_at,
      expira_em: c.expira_em,
    })),
  }
}

// RAISE EXCEPTION nas RPCs vem com code P0001 e mensagem já em português,
// pensada pro usuário final — não passa por mensagemDeErro() (mesmo padrão de
// fecharCaixa/reabrirCaixa).
function erroDaRpc(error: { code?: string; message: string }): string {
  return error.code === "P0001" ? error.message : mensagemDeErro(error)
}

// Devolve o token em texto — é a única vez que ele existe fora do hash no
// banco. A tela monta o link (origem + /login?convite=<token>) e mostra na
// hora; se a pessoa perder o link, revoga e gera outro.
export async function criarConvite(papelConvidado: string): Promise<{ error?: string; token?: string }> {
  const { supabase, user, igrejaId, papel } = await getUsuarioEIgreja()
  if (!user) return { error: "Não autenticado" }
  if (!igrejaId) return { error: "Nenhuma igreja associada à sua conta" }
  if (papel !== "admin") return { error: MENSAGEM_SO_ADMIN }
  if (!ehPapel(papelConvidado)) return { error: "Papel inválido" }

  const { data, error } = await supabase.rpc("criar_convite", { p_papel: papelConvidado })
  if (error) return { error: erroDaRpc(error) }

  revalidatePath("/configuracoes")
  return { token: data }
}

export async function revogarConvite(id: string): Promise<{ error?: string; success?: boolean }> {
  const { supabase, user, igrejaId, papel } = await getUsuarioEIgreja()
  if (!user) return { error: "Não autenticado" }
  if (!igrejaId) return { error: "Nenhuma igreja associada à sua conta" }
  if (papel !== "admin") return { error: MENSAGEM_SO_ADMIN }

  // .select("id") + checagem de 0 linhas: a policy só deixa apagar convite
  // ainda não usado — um convite que alguém acabou de usar (ou que já foi
  // revogado) não pode aparecer como "revogado com sucesso".
  const { data: linhas, error } = await supabase
    .from("igreja_convites")
    .delete()
    .eq("id", id)
    .eq("igreja_id", igrejaId)
    .is("usado_em", null)
    .select("id")

  if (error) return { error: mensagemDeErro(error) }
  if (!linhas || linhas.length === 0) {
    return { error: "Convite não encontrado ou já usado. Atualize a página." }
  }

  revalidatePath("/configuracoes")
  return { success: true }
}

export async function alterarPapelMembro(userId: string, novoPapel: string): Promise<{ error?: string; success?: boolean }> {
  const { supabase, user, igrejaId, papel } = await getUsuarioEIgreja()
  if (!user) return { error: "Não autenticado" }
  if (!igrejaId) return { error: "Nenhuma igreja associada à sua conta" }
  if (papel !== "admin") return { error: MENSAGEM_SO_ADMIN }
  if (!ehPapel(novoPapel)) return { error: "Papel inválido" }

  const { error } = await supabase.rpc("alterar_papel_membro", { p_user_id: userId, p_papel: novoPapel })
  if (error) return { error: erroDaRpc(error) }

  revalidatePath("/configuracoes")
  return { success: true }
}

export async function removerMembro(userId: string): Promise<{ error?: string; success?: boolean }> {
  const { supabase, user, igrejaId, papel } = await getUsuarioEIgreja()
  if (!user) return { error: "Não autenticado" }
  if (!igrejaId) return { error: "Nenhuma igreja associada à sua conta" }
  if (papel !== "admin") return { error: MENSAGEM_SO_ADMIN }

  const { error } = await supabase.rpc("remover_membro", { p_user_id: userId })
  if (error) return { error: erroDaRpc(error) }

  revalidatePath("/configuracoes")
  return { success: true }
}
