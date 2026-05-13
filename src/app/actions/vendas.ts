"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import type { FormaPagamento, Item, Venda } from "@/types/database"

export type VendaItem = {
  quantidade: number
  valor_unitario: number
  subtotal: number
  tab_itens: { nome: string } | null
}

export type VendaComItens = Venda & { tab_vendas_itens: VendaItem[] }

export async function listarVendasHoje(): Promise<VendaComItens[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return [] as VendaComItens[]

  const hoje = new Date().toISOString().split("T")[0]

  const { data: vendas, error } = await supabase
    .from("tab_vendas")
    .select("*")
    .eq("user_id", user.id)
    .gte("data_hora", `${hoje}T00:00:00`)
    .lte("data_hora", `${hoje}T23:59:59`)
    .order("data_hora", { ascending: false })

  if (error || !vendas || vendas.length === 0) return []

  const vendaIds = vendas.map((v) => v.id)

  const { data: itens } = await supabase
    .from("tab_vendas_itens")
    .select("venda_id, quantidade, valor_unitario, subtotal, item_id")
    .in("venda_id", vendaIds)

  const itemIds = [...new Set((itens ?? []).map((i) => i.item_id))]

  const { data: produtos } = itemIds.length > 0
    ? await supabase.from("tab_itens").select("id, nome").in("id", itemIds)
    : { data: [] }

  const produtoMap = new Map((produtos ?? []).map((p) => [p.id, p.nome]))

  return vendas.map((venda) => ({
    ...venda,
    tab_vendas_itens: (itens ?? [])
      .filter((i) => i.item_id && i.venda_id === venda.id)
      .map((i) => ({
        quantidade: i.quantidade,
        valor_unitario: i.valor_unitario,
        subtotal: i.subtotal,
        tab_itens: { nome: produtoMap.get(i.item_id) ?? "" },
      })),
  }))
}

export interface ItemVenda {
  item_id: string
  nome: string
  quantidade: number
  valor_unitario: number
}

export async function criarVenda(dados: {
  cliente: string
  forma_pagamento: FormaPagamento
  desconto: number
  itens: ItemVenda[]
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Não autenticado" }

  if (dados.itens.length === 0) return { error: "Adicione ao menos um item" }

  const total = dados.itens.reduce((sum, i) => sum + i.quantidade * i.valor_unitario, 0) - dados.desconto

  const status = dados.forma_pagamento === "fiado" ? "pendente" : "pago"

  const { data: venda, error: errVenda } = await supabase
    .from("tab_vendas")
    .insert({
      cliente: dados.cliente || null,
      forma_pagamento: dados.forma_pagamento,
      desconto: dados.desconto,
      total,
      status,
      user_id: user.id,
      data_hora: new Date().toISOString(),
    })
    .select("id")
    .single()

  if (errVenda) return { error: errVenda.message }

  const itensRows = dados.itens.map((i) => ({
    venda_id: venda.id,
    item_id: i.item_id,
    quantidade: i.quantidade,
    valor_unitario: i.valor_unitario,
    subtotal: i.quantidade * i.valor_unitario,
  }))

  const { error: errItens } = await supabase.from("tab_vendas_itens").insert(itensRows)
  if (errItens) return { error: errItens.message }

  const descricao = dados.cliente
    ? `Venda para ${dados.cliente}`
    : `Venda ${venda.id.slice(0, 8)}`

  if (dados.forma_pagamento !== "fiado") {
    await supabase.from("tab_extrato_financeiro").insert({
      tipo_movimentacao: "entrada",
      forma_pagamento: dados.forma_pagamento,
      valor: total,
      descricao,
      venda_id: venda.id,
      user_id: user.id,
      data_hora: new Date().toISOString(),
    })
  } else {
    await supabase.from("tab_contas_receber").insert({
      cliente: dados.cliente || "Cliente",
      valor_devido: total,
      data_venda: new Date().toISOString().split("T")[0],
      descricao,
      venda_id: venda.id,
      user_id: user.id,
    })
  }

  revalidatePath("/vendas")
  revalidatePath("/financeiro/extrato")
  revalidatePath("/financeiro/contas-receber")
  return { success: true }
}

export async function cancelarVenda(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Não autenticado" }

  const { error } = await supabase
    .from("tab_vendas")
    .update({ status: "cancelado" })
    .eq("id", id)
    .eq("user_id", user.id)

  if (error) return { error: error.message }
  revalidatePath("/vendas")
  return { success: true }
}

export async function listarItensCardapioHoje(): Promise<Item[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return [] as Item[]

  const hoje = new Date().toISOString().split("T")[0]

  const { data: cardapio } = await supabase
    .from("tab_cardapio_dia")
    .select("id")
    .eq("user_id", user.id)
    .eq("data", hoje)
    .single()

  if (!cardapio) {
    const { data: todos } = await supabase
      .from("tab_itens")
      .select("*")
      .eq("user_id", user.id)
      .eq("ativo", true)
      .order("nome")
    return todos ?? []
  }

  const { data: relacoes } = await supabase
    .from("tab_cardapio_dia_itens")
    .select("item_id")
    .eq("cardapio_id", cardapio.id)

  const ids = (relacoes ?? []).map((r) => r.item_id)
  if (ids.length === 0) return []

  const { data: produtos } = await supabase
    .from("tab_itens")
    .select("*")
    .in("id", ids)
    .order("nome")

  return produtos ?? []
}
