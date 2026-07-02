"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { mensagemDeErro } from "@/lib/erros"
import type { ContaPagar, ContaReceber, ExtratoFinanceiro } from "@/types/database"

export async function listarContasPagar(): Promise<ContaPagar[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return [] as ContaPagar[]

  const { data } = await supabase
    .from("tab_contas_pagar")
    .select("*")
    .eq("user_id", user.id)
    .order("data", { ascending: false })

  return (data ?? []) as ContaPagar[]
}

export async function criarContaPagar(formData: FormData): Promise<{ error?: string; success?: boolean }> {
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

  if (error) return { error: mensagemDeErro(error) }
  revalidatePath("/financeiro/contas-pagar")
  return { success: true }
}

export async function pagarConta(id: string): Promise<{ error?: string; success?: boolean }> {
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

  if (error) return { error: mensagemDeErro(error) }

  await supabase.from("tab_extrato_financeiro").insert({
    tipo_movimentacao: "saida" as const,
    forma_pagamento: "dinheiro" as const,
    valor: (conta as ContaPagar).valor,
    descricao: (conta as ContaPagar).descricao,
    user_id: user.id,
    data_hora: new Date().toISOString(),
  })

  revalidatePath("/financeiro/contas-pagar")
  revalidatePath("/financeiro/extrato")
  return { success: true }
}

export async function listarContasReceber(): Promise<ContaReceber[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return [] as ContaReceber[]

  const { data } = await supabase
    .from("tab_contas_receber")
    .select("*")
    .eq("user_id", user.id)
    .order("data_venda", { ascending: false })

  return (data ?? []) as ContaReceber[]
}

export async function baixarContaReceber(id: string, formaPagamento: string): Promise<{ error?: string; success?: boolean }> {
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
  if ((conta as ContaReceber).pago) return { error: "Esta conta já foi recebida" }

  // Bloqueia recebimento de fiado cuja venda de origem foi cancelada.
  const vendaId = (conta as ContaReceber).venda_id
  if (vendaId) {
    const { data: venda } = await supabase
      .from("tab_vendas")
      .select("status")
      .eq("id", vendaId)
      .eq("user_id", user.id)
      .single()

    if (venda?.status === "cancelado") {
      return { error: "A venda desta conta foi cancelada. Não é possível receber." }
    }
  }

  const { error } = await supabase
    .from("tab_contas_receber")
    .update({
      pago: true,
      data_baixa: new Date().toISOString().split("T")[0],
      forma_pagamento_baixa: formaPagamento,
    })
    .eq("id", id)
    .eq("user_id", user.id)

  if (error) return { error: mensagemDeErro(error) }

  const c = conta as ContaReceber
  await supabase.from("tab_extrato_financeiro").insert({
    tipo_movimentacao: "entrada" as const,
    forma_pagamento: formaPagamento as "dinheiro" | "pix" | "cartao" | "fiado",
    valor: c.valor_devido,
    descricao: `Recebimento fiado - ${c.cliente}`,
    venda_id: c.venda_id,
    user_id: user.id,
    data_hora: new Date().toISOString(),
  })

  revalidatePath("/financeiro/contas-receber")
  revalidatePath("/financeiro/extrato")
  return { success: true }
}

export async function listarExtrato(): Promise<ExtratoFinanceiro[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return [] as ExtratoFinanceiro[]

  const hoje = new Date().toISOString().split("T")[0]

  const { data } = await supabase
    .from("tab_extrato_financeiro")
    .select("*")
    .eq("user_id", user.id)
    .gte("data_hora", `${hoje}T00:00:00`)
    .lte("data_hora", `${hoje}T23:59:59`)
    .order("data_hora", { ascending: false })

  return (data ?? []) as ExtratoFinanceiro[]
}
