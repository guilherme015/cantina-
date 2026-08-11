"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { mensagemDeErro } from "@/lib/erros"

export type CardapioHoje = {
  id: string
  data: string
  item_ids: string[]
}

export async function getCardapioPorData(data: string): Promise<CardapioHoje | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: cardapio } = await supabase
    .from("tab_cardapio_dia")
    .select("id, data")
    .eq("user_id", user.id)
    .eq("data", data)
    .single()

  if (!cardapio) return null

  const { data: relacoes } = await supabase
    .from("tab_cardapio_dia_itens")
    .select("item_id")
    .eq("cardapio_id", cardapio.id)

  return {
    id: cardapio.id,
    data: cardapio.data,
    item_ids: (relacoes ?? []).map((r) => r.item_id),
  }
}

export async function salvarCardapio(data: string, itemIds: string[]) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Não autenticado" }

  let { data: cardapio } = await supabase
    .from("tab_cardapio_dia")
    .select("id")
    .eq("user_id", user.id)
    .eq("data", data)
    .single()

  if (!cardapio) {
    const { data: novo, error: errCriacao } = await supabase
      .from("tab_cardapio_dia")
      .insert({ data, user_id: user.id })
      .select("id")
      .single()

    if (errCriacao) return { error: mensagemDeErro(errCriacao) }
    cardapio = novo
  }

  await supabase
    .from("tab_cardapio_dia_itens")
    .delete()
    .eq("cardapio_id", cardapio!.id)

  if (itemIds.length > 0) {
    const rows = itemIds.map((item_id) => ({ cardapio_id: cardapio!.id, item_id }))
    const { error } = await supabase.from("tab_cardapio_dia_itens").insert(rows)
    if (error) return { error: mensagemDeErro(error) }
  }

  revalidatePath("/cadastros/cardapio")
  revalidatePath("/vendas")
  return { success: true }
}

// Keep backward-compat alias used by vendas or other callers
export async function getCardapioHoje() {
  const hoje = new Date().toISOString().split("T")[0]
  return getCardapioPorData(hoje)
}

export async function salvarCardapioHoje(itemIds: string[]) {
  const hoje = new Date().toISOString().split("T")[0]
  return salvarCardapio(hoje, itemIds)
}
