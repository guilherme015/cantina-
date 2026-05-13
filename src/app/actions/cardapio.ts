"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

function hoje() {
  return new Date().toISOString().split("T")[0]
}

export async function getCardapioHoje() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: cardapio } = await supabase
    .from("tab_cardapio_dia")
    .select("*, tab_cardapio_dia_itens(item_id)")
    .eq("user_id", user.id)
    .eq("data", hoje())
    .single()

  return cardapio
}

export async function salvarCardapioHoje(itemIds: string[]) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Não autenticado" }

  const data = hoje()

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

    if (errCriacao) return { error: errCriacao.message }
    cardapio = novo
  }

  await supabase
    .from("tab_cardapio_dia_itens")
    .delete()
    .eq("cardapio_id", cardapio!.id)

  if (itemIds.length > 0) {
    const rows = itemIds.map((item_id) => ({ cardapio_id: cardapio!.id, item_id }))
    const { error } = await supabase.from("tab_cardapio_dia_itens").insert(rows)
    if (error) return { error: error.message }
  }

  revalidatePath("/cadastros/cardapio")
  revalidatePath("/vendas")
  return { success: true }
}
