"use server"

import { revalidatePath } from "next/cache"
import { mensagemDeErro } from "@/lib/erros"
import { getUsuarioEIgreja } from "@/lib/auth-contexto"
import type { Item } from "@/types/database"

export async function listarProdutos(): Promise<Item[]> {
  const { supabase, user, igrejaId } = await getUsuarioEIgreja()
  if (!user || !igrejaId) return [] as Item[]

  const { data, error } = await supabase
    .from("tab_itens")
    .select("*")
    .eq("igreja_id", igrejaId)
    .order("nome")

  if (error) return [] as Item[]
  return (data ?? []) as Item[]
}

export async function criarProduto(formData: FormData): Promise<{ error?: string; success?: boolean }> {
  const { supabase, user, igrejaId } = await getUsuarioEIgreja()
  if (!user) return { error: "Não autenticado" }
  if (!igrejaId) return { error: "Nenhuma igreja associada à sua conta" }

  const nome = formData.get("nome") as string
  const preco = parseFloat(formData.get("preco") as string)

  if (!nome || isNaN(preco) || preco <= 0) {
    return { error: "Nome e preço são obrigatórios" }
  }

  const { error } = await supabase.from("tab_itens").insert({
    nome,
    preco,
    ativo: true,
    user_id: user.id,
    igreja_id: igrejaId,
  })

  if (error) return { error: mensagemDeErro(error) }
  revalidatePath("/cadastros/produtos")
  return { success: true }
}

export async function atualizarProduto(id: string, formData: FormData): Promise<{ error?: string; success?: boolean }> {
  const { supabase, user, igrejaId } = await getUsuarioEIgreja()
  if (!user) return { error: "Não autenticado" }
  if (!igrejaId) return { error: "Nenhuma igreja associada à sua conta" }

  const nome = formData.get("nome") as string
  const preco = parseFloat(formData.get("preco") as string)

  if (!nome || isNaN(preco) || preco <= 0) {
    return { error: "Nome e preço são obrigatórios" }
  }

  const { error } = await supabase
    .from("tab_itens")
    .update({ nome, preco })
    .eq("id", id)
    .eq("igreja_id", igrejaId)

  if (error) return { error: mensagemDeErro(error) }
  revalidatePath("/cadastros/produtos")
  return { success: true }
}

export async function toggleProdutoAtivo(id: string, ativo: boolean): Promise<{ error?: string; success?: boolean }> {
  const { supabase, user, igrejaId } = await getUsuarioEIgreja()
  if (!user) return { error: "Não autenticado" }
  if (!igrejaId) return { error: "Nenhuma igreja associada à sua conta" }

  const { error } = await supabase
    .from("tab_itens")
    .update({ ativo })
    .eq("id", id)
    .eq("igreja_id", igrejaId)

  if (error) return { error: mensagemDeErro(error) }
  revalidatePath("/cadastros/produtos")
  revalidatePath("/cadastros/cardapio")
  return { success: true }
}

export async function excluirProduto(id: string): Promise<{ error?: string; success?: boolean }> {
  const { supabase, user, igrejaId } = await getUsuarioEIgreja()
  if (!user) return { error: "Não autenticado" }
  if (!igrejaId) return { error: "Nenhuma igreja associada à sua conta" }

  const { error } = await supabase
    .from("tab_itens")
    .delete()
    .eq("id", id)
    .eq("igreja_id", igrejaId)

  if (error) return { error: mensagemDeErro(error) }
  revalidatePath("/cadastros/produtos")
  return { success: true }
}
