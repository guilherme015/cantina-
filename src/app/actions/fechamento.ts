"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { mensagemDeErro } from "@/lib/erros"
import { diaFechado } from "@/lib/fechamento"
import { hojeBR, limitesDiaBR } from "@/lib/data-br"
import { getUsuarioEIgreja } from "@/lib/auth-contexto"
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
  igrejaId: string,
  data: string
): Promise<Omit<ResumoDia, "jaFechado"> | { error: string }> {
  const { inicio, fimExclusivo } = limitesDiaBR(data)

  const { data: linhas, error, count } = await supabase
    .from("tab_extrato_financeiro")
    .select("tipo_movimentacao, forma_pagamento, valor", { count: "exact" })
    .eq("igreja_id", igrejaId)
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
  const { supabase, user, igrejaId } = await getUsuarioEIgreja()
  if (!user) return { error: "Não autenticado" }
  if (!igrejaId) return { error: "Nenhuma igreja associada à sua conta" }

  const dia = data ?? hojeBR()
  const resumo = await calcularResumo(supabase, igrejaId, dia)
  if ("error" in resumo) return resumo

  const jaFechado = await diaFechado(supabase, igrejaId, dia)

  return { ...resumo, jaFechado }
}

export async function listarFechamentos(): Promise<FechamentoCaixa[]> {
  const { user, igrejaId, supabase } = await getUsuarioEIgreja()
  if (!user || !igrejaId) return []

  const { data } = await supabase
    .from("tab_fechamento_caixa")
    .select("*")
    .eq("igreja_id", igrejaId)
    .order("data", { ascending: false })

  return (data ?? []) as FechamentoCaixa[]
}

export async function fecharCaixa(dados: {
  data: string
  saldoInicial: number
  valorInformado: number
  observacoes?: string
}): Promise<{ error?: string; success?: boolean }> {
  // Sem getUsuarioEIgreja() de propósito: a RPC fechar_caixa resolve a
  // igreja sozinha (SELECT em igreja_membros dentro da função SECURITY
  // DEFINER), então buscar igrejaId aqui também seria uma consulta a mais
  // sem uso — o oposto do que a #37 quer resolver.
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

  // O cálculo do resumo e o insert do fechamento acontecem atomicamente na
  // RPC fechar_caixa (lock por igreja+dia no banco) — calcular aqui em JS e
  // inserir depois deixava uma janela real entre as duas idas ao banco onde
  // uma venda podia entrar sem ser contada, e não tinha como desfazer o
  // fechamento depois (não existe policy de DELETE em tab_fechamento_caixa).
  const { error } = await supabase.rpc("fechar_caixa", {
    p_data: dados.data,
    p_saldo_inicial: arredondar(dados.saldoInicial),
    p_valor_informado: arredondar(dados.valorInformado),
    p_observacoes: dados.observacoes || null,
  })

  if (error) {
    // RAISE EXCEPTION na RPC vem com code P0001 e mensagem já em português,
    // pensada pro usuário final — não passa por mensagemDeErro().
    if (error.code === "P0001") return { error: error.message }
    return { error: mensagemDeErro(error) }
  }

  revalidatePath("/financeiro/fechamento")
  return { success: true }
}

export async function reabrirCaixa(data: string, justificativa: string): Promise<{ error?: string; success?: boolean }> {
  // Mesmo motivo de fecharCaixa: reabrir_caixa também resolve a igreja
  // sozinha na RPC.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Não autenticado" }

  if (!justificativa.trim()) {
    return { error: "Informe a justificativa para reabrir o caixa" }
  }

  // Mesma lógica de fecharCaixa: a RPC resolve a igreja sozinha, pega o
  // mesmo advisory lock antes de agir, grava o snapshot do fechamento em
  // tab_reaberturas_caixa (auditoria — não existe policy de DELETE em
  // tab_fechamento_caixa pra apagar sem deixar rastro) e só então apaga.
  const { error } = await supabase.rpc("reabrir_caixa", {
    p_data: data,
    p_justificativa: justificativa.trim(),
  })

  if (error) {
    if (error.code === "P0001") return { error: error.message }
    return { error: mensagemDeErro(error) }
  }

  revalidatePath("/financeiro/fechamento")
  return { success: true }
}
