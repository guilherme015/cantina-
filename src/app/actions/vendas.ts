"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { mensagemDeErro } from "@/lib/erros"
import { diaFechado } from "@/lib/fechamento"
import { dataBR, hojeBR, limitesDiaBR } from "@/lib/data-br"
import { getIgrejaIdAtual } from "@/lib/igreja"
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

  const igrejaId = await getIgrejaIdAtual(supabase, user.id)
  if (!igrejaId) return [] as VendaComItens[]

  const { inicio, fimExclusivo } = limitesDiaBR(hojeBR())

  const { data: vendas, error } = await supabase
    .from("tab_vendas")
    .select("*")
    .eq("igreja_id", igrejaId)
    .gte("data_hora", inicio)
    .lt("data_hora", fimExclusivo)
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

  const igrejaId = await getIgrejaIdAtual(supabase, user.id)
  if (!igrejaId) return { error: "Nenhuma igreja associada à sua conta" }

  if (dados.itens.length === 0) return { error: "Adicione ao menos um item" }

  if (await diaFechado(supabase, igrejaId, hojeBR())) {
    return { error: "O caixa de hoje já foi fechado. Não é possível registrar novas vendas." }
  }

  // O desconto nunca pode superar o subtotal — mesma regra exibida na UI.
  const subtotal = dados.itens.reduce((sum, i) => sum + i.quantidade * i.valor_unitario, 0)
  const desconto = Math.min(Math.max(0, dados.desconto), subtotal)
  const total = subtotal - desconto

  const status = dados.forma_pagamento === "fiado" ? "pendente" : "pago"

  const { data: venda, error: errVenda } = await supabase
    .from("tab_vendas")
    .insert({
      cliente: dados.cliente || null,
      forma_pagamento: dados.forma_pagamento,
      desconto,
      total,
      status,
      user_id: user.id,
      igreja_id: igrejaId,
      data_hora: new Date().toISOString(),
    })
    .select("id")
    .single()

  if (errVenda) return { error: mensagemDeErro(errVenda) }

  const itensRows = dados.itens.map((i) => ({
    venda_id: venda.id,
    item_id: i.item_id,
    quantidade: i.quantidade,
    valor_unitario: i.valor_unitario,
    subtotal: i.quantidade * i.valor_unitario,
  }))

  const { error: errItens } = await supabase.from("tab_vendas_itens").insert(itensRows)
  if (errItens) return { error: mensagemDeErro(errItens) }

  const descricao = dados.cliente
    ? `Venda para ${dados.cliente}`
    : `Venda ${venda.id.slice(0, 8)}`

  if (dados.forma_pagamento !== "fiado") {
    const { error: errExtrato } = await supabase.from("tab_extrato_financeiro").insert({
      tipo_movimentacao: "entrada",
      forma_pagamento: dados.forma_pagamento,
      valor: total,
      descricao,
      venda_id: venda.id,
      user_id: user.id,
      igreja_id: igrejaId,
      data_hora: new Date().toISOString(),
    })

    if (errExtrato) {
      // O caixa pode ter sido fechado por outro membro entre a checagem de
      // diaFechado no início desta função e este insert (o trigger de banco
      // rejeita o lançamento nesse caso) — desfaz a venda em vez de deixar
      // um pedido "pago" sem entrada no extrato.
      await supabase.from("tab_vendas_itens").delete().eq("venda_id", venda.id)
      await supabase.from("tab_vendas").delete().eq("id", venda.id).eq("igreja_id", igrejaId)
      return { error: "O caixa foi fechado enquanto a venda era confirmada. Tente novamente." }
    }
  } else {
    await supabase.from("tab_contas_receber").insert({
      cliente: dados.cliente || "Cliente",
      valor_devido: total,
      data_venda: hojeBR(),
      descricao,
      venda_id: venda.id,
      user_id: user.id,
      igreja_id: igrejaId,
    })
  }

  revalidatePath("/vendas")
  revalidatePath("/financeiro/extrato")
  revalidatePath("/financeiro/fechamento")
  revalidatePath("/financeiro/contas-receber")
  return { success: true }
}

export async function cancelarVenda(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Não autenticado" }

  const igrejaId = await getIgrejaIdAtual(supabase, user.id)
  if (!igrejaId) return { error: "Nenhuma igreja associada à sua conta" }

  const { data: venda } = await supabase
    .from("tab_vendas")
    .select("id, status, forma_pagamento, data_hora")
    .eq("id", id)
    .eq("igreja_id", igrejaId)
    .single()

  if (!venda) return { error: "Venda não encontrada" }
  if (venda.status === "cancelado") return { error: "Esta venda já foi cancelada" }

  if (venda.forma_pagamento === "fiado") {
    // Fiado ainda não recebido não tem nenhum lançamento de caixa (nem no
    // extrato, nem uma conta a receber paga) — não há o que a trava de dia
    // fechado precise proteger aqui. Só bloqueamos se já foi recebido.
    const { data: contaPaga, error: errContaPaga } = await supabase
      .from("tab_contas_receber")
      .select("id")
      .eq("venda_id", id)
      .eq("igreja_id", igrejaId)
      .eq("pago", true)
      .limit(1)

    if (errContaPaga) return { error: mensagemDeErro(errContaPaga) }
    if (contaPaga.length > 0) {
      return { error: "O fiado desta venda já foi recebido. Não é possível cancelar." }
    }
  } else {
    // Venda não-fiado sempre tem um lançamento de entrada no extrato — checa
    // a data desse lançamento (não a da venda) antes de apagá-lo.
    const { data: entrada } = await supabase
      .from("tab_extrato_financeiro")
      .select("data_hora")
      .eq("venda_id", id)
      .eq("igreja_id", igrejaId)
      .limit(1)
      .maybeSingle()

    const dataDoLancamento = entrada ? dataBR(entrada.data_hora) : dataBR(venda.data_hora)
    if (await diaFechado(supabase, igrejaId, dataDoLancamento)) {
      return { error: "O caixa deste dia já foi fechado. Não é possível cancelar esta venda." }
    }
  }

  const { error } = await supabase
    .from("tab_vendas")
    .update({ status: "cancelado" })
    .eq("id", id)
    .eq("igreja_id", igrejaId)

  if (error) return { error: mensagemDeErro(error) }

  // Estorna os lançamentos financeiros ligados à venda.
  const { error: errExtrato } = await supabase
    .from("tab_extrato_financeiro")
    .delete()
    .eq("venda_id", id)
    .eq("igreja_id", igrejaId)

  if (errExtrato) {
    // O caixa pode ter sido fechado por outro membro entre a checagem de
    // diaFechado acima e este delete (o trigger de banco também protege
    // DELETE) — desfaz o cancelamento em vez de deixar a venda cancelada
    // com o lançamento intacto no extrato.
    await supabase.from("tab_vendas").update({ status: venda.status }).eq("id", id).eq("igreja_id", igrejaId)
    return { error: "O caixa foi fechado enquanto a venda era cancelada. Tente novamente." }
  }

  await supabase
    .from("tab_contas_receber")
    .delete()
    .eq("venda_id", id)
    .eq("igreja_id", igrejaId)
    .eq("pago", false)

  revalidatePath("/vendas")
  revalidatePath("/financeiro/extrato")
  revalidatePath("/financeiro/fechamento")
  revalidatePath("/financeiro/contas-receber")
  return { success: true }
}

export async function listarItensCardapioHoje(): Promise<Item[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return [] as Item[]

  const igrejaId = await getIgrejaIdAtual(supabase, user.id)
  if (!igrejaId) return [] as Item[]

  const hoje = new Date().toISOString().split("T")[0]

  const { data: cardapio } = await supabase
    .from("tab_cardapio_dia")
    .select("id")
    .eq("igreja_id", igrejaId)
    .eq("data", hoje)
    .single()

  if (!cardapio) {
    const { data: todos } = await supabase
      .from("tab_itens")
      .select("*")
      .eq("igreja_id", igrejaId)
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
