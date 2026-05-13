"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export async function listarProdutos() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from("tab_itens")
    .select("*")
    .eq("user_id", user.id)
    .order("nome")

  if (error) return []
  return data
}

export async function criarProduto(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Não autenticado" }

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
  })

  if (error) return { error: error.message }
  revalidatePath("/cadastros/produtos")
  return { success: true }
}

export async function atualizarProduto(id: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Não autenticado" }

  const nome = formData.get("nome") as string
  const preco = parseFloat(formData.get("preco") as string)

  if (!nome || isNaN(preco) || preco <= 0) {
    return { error: "Nome e preço são obrigatórios" }
  }

  const { error } = await supabase
    .from("tab_itens")
    .update({ nome, preco })
    .eq("id", id)
    .eq("user_id", user.id)

  if (error) return { error: error.message }
  revalidatePath("/cadastros/produtos")
  return { success: true }
}

export async function toggleProdutoAtivo(id: string, ativo: boolean) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Não autenticado" }

  const { error } = await supabase
    .from("tab_itens")
    .update({ ativo })
    .eq("id", id)
    .eq("user_id", user.id)

  if (error) return { error: error.message }
  revalidatePath("/cadastros/produtos")
  revalidatePath("/cadastros/cardapio")
  return { success: true }
}

export async function excluirProduto(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Não autenticado" }

  const { error } = await supabase
    .from("tab_itens")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)

  if (error) return { error: error.message }
  revalidatePath("/cadastros/produtos")
  return { success: true }
}
