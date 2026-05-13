"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export async function listarContasPagar() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from("tab_contas_pagar")
    .select("*")
    .eq("user_id", user.id)
    .order("data", { ascending: false })

  return data ?? []
}

export async function criarContaPagar(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Não autenticado" }

  const descricao = formData.get("descricao") as string
  const valor = parseFloat(formData.get("valor") as string)
  const data = formData.get("data") as string
  const categoria = formData.get("categoria") as string

  if (!descricao || isNaN(valor) || valor <= 0 || !data) {
    return { error: "Preencha todos os campos obrigatórios" }
  }

  const { error } = await supabase.from("tab_contas_pagar").insert({
    descricao,
    valor,
    data,
    categoria: categoria || null,
    pago: false,
    user_id: user.id,
  })

  if (error) return { error: error.message }
  revalidatePath("/financeiro/contas-pagar")
  return { success: true }
}

export async function pagarConta(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Não autenticado" }

  const { data: conta } = await supabase
    .from("tab_contas_pagar")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single()

  if (!conta) return { error: "Conta não encontrada" }

  const { error } = await supabase
    .from("tab_contas_pagar")
    .update({ pago: true })
    .eq("id", id)
    .eq("user_id", user.id)

  if (error) return { error: error.message }

  await supabase.from("tab_extrato_financeiro").insert({
    tipo_movimentacao: "saida",
    forma_pagamento: "dinheiro",
    valor: conta.valor,
    descricao: conta.descricao,
    user_id: user.id,
    data_hora: new Date().toISOString(),
  })

  revalidatePath("/financeiro/contas-pagar")
  revalidatePath("/financeiro/extrato")
  return { success: true }
}

export async function listarContasReceber() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from("tab_contas_receber")
    .select("*")
    .eq("user_id", user.id)
    .order("data_venda", { ascending: false })

  return data ?? []
}

export async function baixarContaReceber(id: string, formaPagamento: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Não autenticado" }

  const { data: conta } = await supabase
    .from("tab_contas_receber")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single()

  if (!conta) return { error: "Conta não encontrada" }

  const { error } = await supabase
    .from("tab_contas_receber")
    .update({
      pago: true,
      data_baixa: new Date().toISOString().split("T")[0],
      forma_pagamento_baixa: formaPagamento,
    })
    .eq("id", id)
    .eq("user_id", user.id)

  if (error) return { error: error.message }

  await supabase.from("tab_extrato_financeiro").insert({
    tipo_movimentacao: "entrada",
    forma_pagamento: formaPagamento as "dinheiro" | "pix" | "cartao" | "fiado",
    valor: conta.valor_devido,
    descricao: `Recebimento fiado - ${conta.cliente}`,
    venda_id: conta.venda_id,
    user_id: user.id,
    data_hora: new Date().toISOString(),
  })

  revalidatePath("/financeiro/contas-receber")
  revalidatePath("/financeiro/extrato")
  return { success: true }
}

export async function listarExtrato() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const hoje = new Date().toISOString().split("T")[0]

  const { data } = await supabase
    .from("tab_extrato_financeiro")
    .select("*")
    .eq("user_id", user.id)
    .gte("data_hora", `${hoje}T00:00:00`)
    .lte("data_hora", `${hoje}T23:59:59`)
    .order("data_hora", { ascending: false })

  return data ?? []
}
