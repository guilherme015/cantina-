"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { mensagemDeErro } from "@/lib/erros"
import { diaFechado } from "@/lib/fechamento"
import { hojeBR, limitesDiaBR } from "@/lib/data-br"
import type { FechamentoCaixa } from "@/types/database"

export interface ResumoDia {
  data: string
  entradasDinheiro: number
  entradasPix: number
  entradasCartao: number
  totalEntradas: number
  totalSaidas: number
  jaFechado: boolean
}

function arredondar(valor: number): number {
  return Math.round(valor * 100) / 100
}

async function calcularResumo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  data: string
): Promise<Omit<ResumoDia, "jaFechado"> | { error: string }> {
  const { inicio, fimExclusivo } = limitesDiaBR(data)

  const { data: linhas, error, count } = await supabase
    .from("tab_extrato_financeiro")
    .select("tipo_movimentacao, forma_pagamento, valor", { count: "exact" })
    .eq("user_id", userId)
    .gte("data_hora", inicio)
    .lt("data_hora", fimExclusivo)
    .limit(5000)

  if (error) return { error: mensagemDeErro(error) }

  const movimentacoes = linhas ?? []

  if (count !== null && count > movimentacoes.length) {
    return { error: "Muitas movimentações neste dia para calcular o resumo com segurança. Fale com o suporte." }
  }

  const entradasDinheiro = movimentacoes
    .filter((m) => m.tipo_movimentacao === "entrada" && m.forma_pagamento === "dinheiro")
    .reduce((s, m) => s + m.valor, 0)
  const entradasPix = movimentacoes
    .filter((m) => m.tipo_movimentacao === "entrada" && m.forma_pagamento === "pix")
    .reduce((s, m) => s + m.valor, 0)
  const entradasCartao = movimentacoes
    .filter((m) => m.tipo_movimentacao === "entrada" && m.forma_pagamento === "cartao")
    .reduce((s, m) => s + m.valor, 0)
  const totalEntradas = movimentacoes
    .filter((m) => m.tipo_movimentacao === "entrada")
    .reduce((s, m) => s + m.valor, 0)
  const totalSaidas = movimentacoes
    .filter((m) => m.tipo_movimentacao === "saida")
    .reduce((s, m) => s + m.valor, 0)

  return {
    data,
    entradasDinheiro: arredondar(entradasDinheiro),
    entradasPix: arredondar(entradasPix),
    entradasCartao: arredondar(entradasCartao),
    totalEntradas: arredondar(totalEntradas),
    totalSaidas: arredondar(totalSaidas),
  }
}

export async function resumoDoDia(data?: string): Promise<ResumoDia | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Não autenticado" }

  const dia = data ?? hojeBR()
  const resumo = await calcularResumo(supabase, user.id, dia)
  if ("error" in resumo) return resumo

  const jaFechado = await diaFechado(supabase, user.id, dia)

  return { ...resumo, jaFechado }
}

export async function listarFechamentos(): Promise<FechamentoCaixa[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from("tab_fechamento_caixa")
    .select("*")
    .eq("user_id", user.id)
    .order("data", { ascending: false })

  return (data ?? []) as FechamentoCaixa[]
}

export async function fecharCaixa(dados: {
  data: string
  saldoInicial: number
  valorInformado: number
  observacoes?: string
}): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Não autenticado" }

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(dados.data) ||
    isNaN(dados.saldoInicial) || dados.saldoInicial < 0 ||
    isNaN(dados.valorInformado) || dados.valorInformado < 0
  ) {
    return { error: "Preencha todos os campos obrigatórios" }
  }

  if (dados.data > hojeBR()) {
    return { error: "Não é possível fechar um dia no futuro." }
  }

  if (await diaFechado(supabase, user.id, dados.data)) {
    return { error: "Este dia já foi fechado." }
  }

  const resumo = await calcularResumo(supabase, user.id, dados.data)
  if ("error" in resumo) return resumo

  const saldoInicial = arredondar(dados.saldoInicial)
  const valorInformado = arredondar(dados.valorInformado)
  const valorCalculado = arredondar(saldoInicial + resumo.entradasDinheiro - resumo.totalSaidas)
  const diferenca = arredondar(valorInformado - valorCalculado)

  const { error } = await supabase.from("tab_fechamento_caixa").insert({
    data: dados.data,
    saldo_inicial: saldoInicial,
    entradas_dinheiro: resumo.entradasDinheiro,
    entradas_pix: resumo.entradasPix,
    entradas_cartao: resumo.entradasCartao,
    total_saidas: resumo.totalSaidas,
    valor_calculado: valorCalculado,
    valor_informado: valorInformado,
    diferenca,
    observacoes: dados.observacoes || null,
    user_id: user.id,
  })

  if (error) return { error: mensagemDeErro(error) }

  revalidatePath("/financeiro/fechamento")
  return { success: true }
}
