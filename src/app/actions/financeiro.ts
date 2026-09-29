"use server"

import { revalidatePath } from "next/cache"
import { mensagemDeErro } from "@/lib/erros"
import { diaFechado } from "@/lib/fechamento"
import { hojeBR, limitesDiaBR } from "@/lib/data-br"
import { getUsuarioEIgreja } from "@/lib/auth-contexto"
import type { ContaPagar, ContaReceber, ExtratoFinanceiro } from "@/types/database"

export async function listarContasPagar(): Promise<ContaPagar[]> {
  const { supabase, user, igrejaId } = await getUsuarioEIgreja()
  if (!user || !igrejaId) return []

  const { data } = await supabase
    .from("tab_contas_pagar")
    .select("*")
    .eq("igreja_id", igrejaId)
    .order("data", { ascending: false })

  return (data ?? []) as ContaPagar[]
}

export async function criarContaPagar(formData: FormData): Promise<{ error?: string; success?: boolean }> {
  const { supabase, user, igrejaId } = await getUsuarioEIgreja()
  if (!user) return { error: "Não autenticado" }
  if (!igrejaId) return { error: "Nenhuma igreja associada à sua conta" }

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
    igreja_id: igrejaId,
  })

  if (error) return { error: mensagemDeErro(error) }
  revalidatePath("/financeiro/contas-pagar")
  return { success: true }
}

export async function editarContaPagar(id: string, formData: FormData): Promise<{ error?: string; success?: boolean }> {
  const { supabase, user, igrejaId } = await getUsuarioEIgreja()
  if (!user) return { error: "Não autenticado" }
  if (!igrejaId) return { error: "Nenhuma igreja associada à sua conta" }

  const descricao = formData.get("descricao") as string
  const valor = parseFloat(formData.get("valor") as string)
  const data = formData.get("data") as string
  const categoria = formData.get("categoria") as string

  if (!descricao || isNaN(valor) || valor <= 0 || !data) {
    return { error: "Preencha todos os campos obrigatórios" }
  }

  const { data: linhas, error } = await supabase
    .from("tab_contas_pagar")
    .update({ descricao, valor, data, categoria: categoria || null })
    .eq("id", id)
    .eq("igreja_id", igrejaId)
    .eq("pago", false)
    .select("id")

  if (error) return { error: mensagemDeErro(error) }
  if (!linhas || linhas.length === 0) {
    return { error: "Conta não encontrada ou já paga. Não é possível editar." }
  }
  revalidatePath("/financeiro/contas-pagar")
  return { success: true }
}

export async function excluirContaPagar(id: string): Promise<{ error?: string; success?: boolean }> {
  const { supabase, user, igrejaId } = await getUsuarioEIgreja()
  if (!user) return { error: "Não autenticado" }
  if (!igrejaId) return { error: "Nenhuma igreja associada à sua conta" }

  const { data: linhas, error } = await supabase
    .from("tab_contas_pagar")
    .delete()
    .eq("id", id)
    .eq("igreja_id", igrejaId)
    .eq("pago", false)
    .select("id")

  if (error) return { error: mensagemDeErro(error) }
  if (!linhas || linhas.length === 0) {
    return { error: "Conta não encontrada ou já paga. Não é possível excluir." }
  }
  revalidatePath("/financeiro/contas-pagar")
  return { success: true }
}

export async function pagarConta(id: string): Promise<{ error?: string; success?: boolean }> {
  const { supabase, user, igrejaId } = await getUsuarioEIgreja()
  if (!user) return { error: "Não autenticado" }
  if (!igrejaId) return { error: "Nenhuma igreja associada à sua conta" }

  const { data: conta } = await supabase
    .from("tab_contas_pagar")
    .select("*")
    .eq("id", id)
    .eq("igreja_id", igrejaId)
    .single()

  if (!conta) return { error: "Conta não encontrada" }
  if ((conta as ContaPagar).pago) return { error: "Esta conta já foi paga" }

  if (await diaFechado(supabase, igrejaId, hojeBR())) {
    return { error: "O caixa de hoje já foi fechado. Não é possível registrar pagamentos." }
  }

  // .eq("pago", false) torna esse update atômico: com mais de um membro na
  // mesma igreja, só quem realmente vira false->true grava a saída no
  // extrato — sem isso, dois cliques quase simultâneos lançam a mesma
  // despesa duas vezes.
  const { data: linhas, error } = await supabase
    .from("tab_contas_pagar")
    .update({ pago: true })
    .eq("id", id)
    .eq("igreja_id", igrejaId)
    .eq("pago", false)
    .select("id")

  if (error) return { error: mensagemDeErro(error) }
  if (!linhas || linhas.length === 0) {
    return { error: "Esta conta já foi paga" }
  }

  const { error: errExtrato } = await supabase.from("tab_extrato_financeiro").insert({
    tipo_movimentacao: "saida" as const,
    forma_pagamento: "dinheiro" as const,
    valor: (conta as ContaPagar).valor,
    descricao: (conta as ContaPagar).descricao,
    user_id: user.id,
    igreja_id: igrejaId,
    data_hora: new Date().toISOString(),
  })

  if (errExtrato) {
    // O caixa pode ter sido fechado por outro membro entre o UPDATE acima e
    // este insert (o trigger de banco rejeita o lançamento nesse caso) —
    // desfaz a baixa em vez de deixar a conta paga sem entrada no extrato.
    await supabase.from("tab_contas_pagar").update({ pago: false }).eq("id", id).eq("igreja_id", igrejaId)
    return { error: "O caixa foi fechado enquanto o pagamento era confirmado. Tente novamente." }
  }

  revalidatePath("/financeiro/contas-pagar")
  revalidatePath("/financeiro/extrato")
  revalidatePath("/financeiro/fechamento")
  return { success: true }
}

export async function listarContasReceber(): Promise<ContaReceber[]> {
  const { supabase, user, igrejaId } = await getUsuarioEIgreja()
  if (!user || !igrejaId) return []

  const { data } = await supabase
    .from("tab_contas_receber")
    .select("*")
    .eq("igreja_id", igrejaId)
    .order("data_venda", { ascending: false })

  return (data ?? []) as ContaReceber[]
}

export async function editarContaReceber(id: string, dados: { cliente: string; valor_devido: number; data_venda: string; descricao?: string }): Promise<{ error?: string; success?: boolean }> {
  const { supabase, user, igrejaId } = await getUsuarioEIgreja()
  if (!user) return { error: "Não autenticado" }
  if (!igrejaId) return { error: "Nenhuma igreja associada à sua conta" }

  if (!dados.cliente || isNaN(dados.valor_devido) || dados.valor_devido <= 0 || !dados.data_venda) {
    return { error: "Preencha todos os campos obrigatórios" }
  }

  const { data: linhas, error } = await supabase
    .from("tab_contas_receber")
    .update({
      cliente: dados.cliente,
      valor_devido: dados.valor_devido,
      data_venda: dados.data_venda,
      descricao: dados.descricao ?? null,
    })
    .eq("id", id)
    .eq("igreja_id", igrejaId)
    .eq("pago", false)
    .select("id")

  if (error) return { error: mensagemDeErro(error) }
  if (!linhas || linhas.length === 0) {
    return { error: "Conta não encontrada ou já recebida. Não é possível editar." }
  }
  revalidatePath("/financeiro/contas-receber")
  return { success: true }
}

export async function excluirContaReceber(id: string): Promise<{ error?: string; success?: boolean }> {
  const { supabase, user, igrejaId } = await getUsuarioEIgreja()
  if (!user) return { error: "Não autenticado" }
  if (!igrejaId) return { error: "Nenhuma igreja associada à sua conta" }

  const { data: linhas, error } = await supabase
    .from("tab_contas_receber")
    .delete()
    .eq("id", id)
    .eq("igreja_id", igrejaId)
    .eq("pago", false)
    .select("id")

  if (error) return { error: mensagemDeErro(error) }
  if (!linhas || linhas.length === 0) {
    return { error: "Conta não encontrada ou já recebida. Não é possível excluir." }
  }
  revalidatePath("/financeiro/contas-receber")
  return { success: true }
}

export async function baixarContaReceber(id: string, formaPagamento: string): Promise<{ error?: string; success?: boolean }> {
  const { supabase, user, igrejaId } = await getUsuarioEIgreja()
  if (!user) return { error: "Não autenticado" }
  if (!igrejaId) return { error: "Nenhuma igreja associada à sua conta" }

  const { data: conta } = await supabase
    .from("tab_contas_receber")
    .select("*")
    .eq("id", id)
    .eq("igreja_id", igrejaId)
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
      .eq("igreja_id", igrejaId)
      .single()

    if (venda?.status === "cancelado") {
      return { error: "A venda desta conta foi cancelada. Não é possível receber." }
    }
  }

  if (await diaFechado(supabase, igrejaId, hojeBR())) {
    return { error: "O caixa de hoje já foi fechado. Não é possível registrar recebimentos." }
  }

  // .eq("pago", false) torna esse update atômico — mesma razão do
  // pagarConta: com mais de um membro na mesma igreja, dois recebimentos
  // quase simultâneos do mesmo fiado não podem gerar duas entradas.
  const { data: linhas, error } = await supabase
    .from("tab_contas_receber")
    .update({
      pago: true,
      data_baixa: hojeBR(),
      forma_pagamento_baixa: formaPagamento,
    })
    .eq("id", id)
    .eq("igreja_id", igrejaId)
    .eq("pago", false)
    .select("id")

  if (error) return { error: mensagemDeErro(error) }
  if (!linhas || linhas.length === 0) {
    return { error: "Esta conta já foi recebida" }
  }

  const c = conta as ContaReceber

  // Sincroniza o status da venda de origem: sem isso, a tela de Vendas
  // continua mostrando "Fiado" pra sempre mesmo depois do cliente pagar,
  // já que criarVenda grava status "pendente" e nada mais atualizava esse
  // campo depois.
  //
  // .neq("status", "cancelado") torna esse update atômico contra uma
  // corrida com cancelarVenda: sem essa trava, cancelar e receber a mesma
  // venda ao mesmo tempo pode deixar a venda "pago" sem entrada no extrato
  // (o cancelamento apaga o lançamento que este fluxo acabou de criar) — a
  // checagem de venda cancelada mais acima (linhas ~273-285) só cobre o
  // instante da leitura, não protege contra um cancelamento concorrente.
  //
  // É "!= cancelado" e não "== pendente" de propósito: se este mesmo bloco
  // já rodou uma vez com sucesso (venda virou "pago") e o rollback do
  // errExtrato logo abaixo falhar silenciosamente ao tentar voltar pra
  // "pendente", uma nova tentativa de receber com "== pendente" nunca mais
  // bateria — o fiado ficaria travado pra sempre com esse erro. "pago" já
  // sendo o valor é só um no-op idempotente.
  if (c.venda_id) {
    const { data: vendaAtualizada, error: errVenda } = await supabase
      .from("tab_vendas")
      .update({ status: "pago" })
      .eq("id", c.venda_id)
      .eq("igreja_id", igrejaId)
      .neq("status", "cancelado")
      .select("id")

    if (errVenda) {
      await supabase
        .from("tab_contas_receber")
        .update({ pago: false, data_baixa: null, forma_pagamento_baixa: null })
        .eq("id", id)
        .eq("igreja_id", igrejaId)
      return { error: mensagemDeErro(errVenda) }
    }
    if (!vendaAtualizada || vendaAtualizada.length === 0) {
      // Só chega aqui se a venda estiver "cancelado" (única condição que o
      // neq acima rejeita) — ou seja, cancelarVenda venceu a corrida. Ela
      // tentou apagar esta conta a receber, mas nesse instante `pago` ainda
      // não tinha virado true (update lá em cima ainda não tinha commitado
      // no momento do DELETE .eq("pago", false) de cancelarVenda), então a
      // conta sobreviveu. Apaga agora em vez de deixar um fiado "em
      // aberto" (e travado, porque venda cancelada nunca pode ser
      // recebida) de uma venda que já foi cancelada.
      await supabase
        .from("tab_contas_receber")
        .delete()
        .eq("id", id)
        .eq("igreja_id", igrejaId)
        .eq("pago", true)
      return { error: "A venda desta conta foi cancelada. Não é possível receber." }
    }
  }

  const { error: errExtrato } = await supabase.from("tab_extrato_financeiro").insert({
    tipo_movimentacao: "entrada" as const,
    forma_pagamento: formaPagamento as "dinheiro" | "pix" | "cartao" | "fiado",
    valor: c.valor_devido,
    descricao: `Recebimento fiado - ${c.cliente}`,
    venda_id: c.venda_id,
    user_id: user.id,
    igreja_id: igrejaId,
    data_hora: new Date().toISOString(),
  })

  if (errExtrato) {
    // Mesmo caso do pagarConta: o caixa pode ter sido fechado por outro
    // membro entre o UPDATE acima e este insert — desfaz a baixa (e o
    // status da venda) em vez de deixar a conta recebida sem entrada no
    // extrato.
    if (c.venda_id) {
      await supabase.from("tab_vendas").update({ status: "pendente" }).eq("id", c.venda_id).eq("igreja_id", igrejaId)
    }
    await supabase
      .from("tab_contas_receber")
      .update({ pago: false, data_baixa: null, forma_pagamento_baixa: null })
      .eq("id", id)
      .eq("igreja_id", igrejaId)
    return { error: "O caixa foi fechado enquanto o recebimento era confirmado. Tente novamente." }
  }

  revalidatePath("/financeiro/contas-receber")
  revalidatePath("/financeiro/extrato")
  revalidatePath("/financeiro/fechamento")
  revalidatePath("/vendas")
  return { success: true }
}

export async function listarExtrato(): Promise<ExtratoFinanceiro[]> {
  const { supabase, user, igrejaId } = await getUsuarioEIgreja()
  if (!user || !igrejaId) return []

  const { inicio, fimExclusivo } = limitesDiaBR(hojeBR())

  const { data } = await supabase
    .from("tab_extrato_financeiro")
    .select("*")
    .eq("igreja_id", igrejaId)
    .gte("data_hora", inicio)
    .lt("data_hora", fimExclusivo)
    .order("data_hora", { ascending: false })

  return (data ?? []) as ExtratoFinanceiro[]
}
