"use server"

import type { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { mensagemDeErro } from "@/lib/erros"
import { diaFechado } from "@/lib/fechamento"
import { dataBR, hojeBR, limitesDiaBR } from "@/lib/data-br"
import { getUsuarioEIgreja } from "@/lib/auth-contexto"
import type { FormaPagamento, Item, Venda } from "@/types/database"

export type VendaItem = {
  quantidade: number
  valor_unitario: number
  subtotal: number
  tab_itens: { nome: string } | null
}

export type VendaComItens = Venda & { tab_vendas_itens: VendaItem[] }

async function cardapioHojeId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  igrejaId: string
): Promise<string | null> {
  const { data: cardapio } = await supabase
    .from("tab_cardapio_dia")
    .select("id")
    .eq("igreja_id", igrejaId)
    .eq("data", hojeBR())
    .single()

  return cardapio?.id ?? null
}

export async function listarVendasHoje(): Promise<VendaComItens[]> {
  const { supabase, user, igrejaId } = await getUsuarioEIgreja()
  if (!user || !igrejaId) return []

  const { inicio, fimExclusivo } = limitesDiaBR(hojeBR())

  // Um único round trip via PostgREST embedding em vez de 3 (vendas, itens,
  // produtos separados) — Vendas é a tela mais acessada do dia a dia, então
  // essa latência a mais soma rápido.
  const { data: vendas, error } = await supabase
    .from("tab_vendas")
    .select("*, tab_vendas_itens(quantidade, valor_unitario, subtotal, tab_itens(nome))")
    .eq("igreja_id", igrejaId)
    .gte("data_hora", inicio)
    .lt("data_hora", fimExclusivo)
    .order("data_hora", { ascending: false })

  if (error || !vendas) return []

  return vendas as unknown as VendaComItens[]
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
  const { supabase, user, igrejaId } = await getUsuarioEIgreja()
  if (!user) return { error: "Não autenticado" }
  if (!igrejaId) return { error: "Nenhuma igreja associada à sua conta" }

  if (dados.itens.length === 0) return { error: "Adicione ao menos um item" }
  if (dados.itens.some((i) => !Number.isInteger(i.quantidade) || i.quantidade <= 0)) {
    return { error: "Quantidade inválida em um ou mais itens." }
  }

  if (await diaFechado(supabase, igrejaId, hojeBR())) {
    return { error: "O caixa de hoje já foi fechado. Não é possível registrar novas vendas." }
  }

  // A tela só oferece os produtos do cardápio de hoje, mas isso é só UI —
  // uma aba aberta desde ontem, ou uma chamada direta a esta action, ainda
  // conseguiria vender qualquer coisa sem essa conferência no servidor.
  // Sem ela, "cardápio do dia" vira decoração. De quebra, busca o preço
  // real de cada produto aqui: o preço que a tela manda é só o que ela
  // carregou ao abrir a página, e não pode ser a fonte de verdade do valor
  // cobrado (dá pra editar no devtools, ou o preço pode ter mudado com a
  // aba aberta).
  const cardapioId = await cardapioHojeId(supabase, igrejaId)
  const { data: relacoesCardapio } = cardapioId
    ? await supabase
        .from("tab_cardapio_dia_itens")
        .select("item_id, tab_itens!inner(ativo, preco)")
        .eq("cardapio_id", cardapioId)
        .eq("tab_itens.ativo", true)
    : { data: [] }

  const precoPorItem = new Map(
    (relacoesCardapio ?? []).map((r) => [r.item_id, (r.tab_itens as unknown as { preco: number }).preco])
  )
  // Também rejeita (em vez de só substituir em silêncio) se o preço que a
  // tela mandou não bater com o do banco: aceitar a venda com um total
  // diferente do que o botão "Finalizar" mostrou pro operador cobrar do
  // cliente gera uma diferença de caixa no fechamento do dia — mais
  // seguro pedir pra atualizar a página do que gravar um valor que
  // ninguém realmente cobrou.
  const itemInvalido = dados.itens.some((i) => {
    const precoBanco = precoPorItem.get(i.item_id)
    return precoBanco === undefined || Math.round(precoBanco * 100) !== Math.round(i.valor_unitario * 100)
  })
  if (itemInvalido) {
    return { error: "Um ou mais produtos não estão mais no cardápio de hoje, ou o preço mudou. Atualize a página e tente de novo." }
  }

  // O desconto nunca pode superar o subtotal — mesma regra exibida na UI.
  const subtotal = dados.itens.reduce((sum, i) => sum + i.quantidade * precoPorItem.get(i.item_id)!, 0)
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
    .select("id, numero_pedido")
    .single()

  if (errVenda) return { error: mensagemDeErro(errVenda) }

  const itensRows = dados.itens.map((i) => {
    const preco = precoPorItem.get(i.item_id)!
    return {
      venda_id: venda.id,
      item_id: i.item_id,
      quantidade: i.quantidade,
      valor_unitario: preco,
      subtotal: i.quantidade * preco,
    }
  })

  const { error: errItens } = await supabase.from("tab_vendas_itens").insert(itensRows)
  if (errItens) {
    // Sem isso, a venda fica órfã: "pago", sem nenhum item e sem entrada no
    // extrato (o passo seguinte nunca roda) — ainda assim somada no total
    // do dia de Vendas.
    await supabase.from("tab_vendas").delete().eq("id", venda.id).eq("igreja_id", igrejaId)
    return { error: mensagemDeErro(errItens) }
  }

  // numero_pedido (numerado por igreja, ver CLAUDE.md) em vez de fatia do
  // UUID — o UUID não tem nenhum significado pra quem opera o caixa.
  const descricao = dados.cliente
    ? `Venda para ${dados.cliente}`
    : `Pedido #${venda.numero_pedido}`

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
    const { error: errContaReceber } = await supabase.from("tab_contas_receber").insert({
      cliente: dados.cliente || "Cliente",
      valor_devido: total,
      data_venda: hojeBR(),
      descricao,
      venda_id: venda.id,
      user_id: user.id,
      igreja_id: igrejaId,
    })

    if (errContaReceber) {
      // Mesmo caso do ramo não-fiado: sem isso, a venda fica "pendente" pra
      // sempre (somada no total do dia) sem nenhuma conta a receber pra
      // cobrar depois — o fiado simplesmente some.
      await supabase.from("tab_vendas_itens").delete().eq("venda_id", venda.id)
      await supabase.from("tab_vendas").delete().eq("id", venda.id).eq("igreja_id", igrejaId)
      return { error: mensagemDeErro(errContaReceber) }
    }
  }

  revalidatePath("/vendas")
  revalidatePath("/financeiro/extrato")
  revalidatePath("/financeiro/fechamento")
  revalidatePath("/financeiro/contas-receber")
  return { success: true }
}

export async function cancelarVenda(id: string) {
  const { supabase, user, igrejaId } = await getUsuarioEIgreja()
  if (!user) return { error: "Não autenticado" }
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

  // .eq("status", venda.status) torna esse update atômico contra uma
  // corrida com baixarContaReceber: sem essa trava, cancelar e receber o
  // fiado da mesma venda ao mesmo tempo pode fazer este cancelamento
  // sobrescrever um "pago" já confirmado e apagar do extrato (linhas
  // abaixo) a entrada que o recebimento acabou de lançar — a venda ficaria
  // "cancelado" com o dinheiro já contado como recebido em outro lugar.
  const { data: vendaCancelada, error } = await supabase
    .from("tab_vendas")
    .update({ status: "cancelado" })
    .eq("id", id)
    .eq("igreja_id", igrejaId)
    .eq("status", venda.status)
    .select("id")

  if (error) return { error: mensagemDeErro(error) }
  if (!vendaCancelada || vendaCancelada.length === 0) {
    return { error: "Esta venda foi atualizada em outra operação (provavelmente o fiado acabou de ser recebido). Atualize a página." }
  }

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
  const { supabase, user, igrejaId } = await getUsuarioEIgreja()
  if (!user || !igrejaId) return []

  // Sem cardápio configurado pra hoje = nada disponível pra venda. Antes
  // isso caía num fallback que mostrava TODOS os produtos ativos, o que
  // contradiz a ideia de "cardápio do dia": um dia com só 2 produtos
  // selecionados não pode deixar o vendedor oferecer os outros 20 do
  // catálogo. A tela de Vendas já trata itensDisponiveis vazio com uma
  // mensagem direcionando pra configurar o cardápio (ver vendas-client.tsx).
  const cardapioId = await cardapioHojeId(supabase, igrejaId)
  if (!cardapioId) return []

  // !inner + filtro em tab_itens.ativo: um produto desativado no meio do
  // dia (ex.: "acabou") some da venda mesmo se ainda estiver marcado no
  // cardápio de hoje — sem isso ficava selecionável em Vendas mas
  // escondido (e impossível de desmarcar) na tela de Cardápio.
  const { data: relacoes } = await supabase
    .from("tab_cardapio_dia_itens")
    .select("tab_itens!inner(*)")
    .eq("cardapio_id", cardapioId)
    .eq("tab_itens.ativo", true)

  const produtos = (relacoes ?? []).map((r) => r.tab_itens as unknown as Item)
  produtos.sort((a, b) => a.nome.localeCompare(b.nome))
  return produtos
}
