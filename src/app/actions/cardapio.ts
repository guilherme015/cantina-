"use server"

import { revalidatePath } from "next/cache"
import { mensagemDeErro } from "@/lib/erros"
import { getUsuarioEIgreja } from "@/lib/auth-contexto"
import { hojeBR } from "@/lib/data-br"

export type CardapioHoje = {
  id: string
  data: string
  item_ids: string[]
}

export async function getCardapioHoje(): Promise<CardapioHoje | null> {
  const { supabase, user, igrejaId } = await getUsuarioEIgreja()
  if (!user || !igrejaId) return null

  const { data: cardapio } = await supabase
    .from("tab_cardapio_dia")
    .select("id, data")
    .eq("igreja_id", igrejaId)
    .eq("data", hojeBR())
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

export async function salvarCardapioHoje(itemIds: string[]) {
  const { supabase, user, igrejaId } = await getUsuarioEIgreja()
  if (!user) return { error: "Não autenticado" }
  if (!igrejaId) return { error: "Nenhuma igreja associada à sua conta" }

  const data = hojeBR()

  let { data: cardapio } = await supabase
    .from("tab_cardapio_dia")
    .select("id")
    .eq("igreja_id", igrejaId)
    .eq("data", data)
    .single()

  if (!cardapio) {
    const { data: novo, error: errCriacao } = await supabase
      .from("tab_cardapio_dia")
      .insert({ data, user_id: user.id, igreja_id: igrejaId })
      .select("id")
      .single()

    if (errCriacao) return { error: mensagemDeErro(errCriacao) }
    cardapio = novo
  }

  // Backlog conhecido, não bloqueante: delete+insert não é atômico. Se dois
  // membros da mesma igreja salvarem o cardápio de hoje ao mesmo tempo com
  // seleções diferentes, o resultado pode ser a união das duas em vez da
  // que "venceu" por último — precisaria de uma função no banco (mesmo
  // padrão de fechar_caixa) pra ser realmente atômico. Risco baixo (exige
  // 2 pessoas editando no mesmo instante) e a correção é reversível (basta
  // salvar de novo).
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

// Sem cardápio configurado, Vendas não libera nenhum produto pra venda
// (ver listarItensCardapioHoje em vendas.ts) — esse atalho existe pra
// configurar o dia em 1 clique repetindo a última seleção salva, em vez de
// forçar reconstruir a lista do zero todo dia.
//
// Busca o cardápio salvo mais recente ANTES de hoje, não especificamente
// "ontem": a maioria das cantinas de igreja não abre todo dia (só domingo,
// por exemplo), então "ontem" quase sempre estaria vazio.
export async function copiarUltimoCardapio(): Promise<{ error?: string; success?: boolean; itemIds?: string[] }> {
  const { supabase, user, igrejaId } = await getUsuarioEIgreja()
  if (!user) return { error: "Não autenticado" }
  if (!igrejaId) return { error: "Nenhuma igreja associada à sua conta" }

  const { data: ultimoCardapio, error: errBusca } = await supabase
    .from("tab_cardapio_dia")
    .select("id")
    .eq("igreja_id", igrejaId)
    .lt("data", hojeBR())
    .order("data", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (errBusca) return { error: mensagemDeErro(errBusca) }
  if (!ultimoCardapio) return { error: "Nenhum cardápio salvo em dias anteriores." }

  // !inner + ativo=true: não traz de volta produto desativado desde então
  // (senão ele fica selecionado mas invisível — só aparecem os ativos na
  // lista da tela de Cardápio — e impossível de desmarcar).
  const { data: relacoes, error: errRelacoes } = await supabase
    .from("tab_cardapio_dia_itens")
    .select("item_id, tab_itens!inner(ativo)")
    .eq("cardapio_id", ultimoCardapio.id)
    .eq("tab_itens.ativo", true)

  if (errRelacoes) return { error: mensagemDeErro(errRelacoes) }

  const itemIds = (relacoes ?? []).map((r) => r.item_id)
  if (itemIds.length === 0) return { error: "O último cardápio salvo estava vazio (ou os produtos foram desativados)." }

  const resultado = await salvarCardapioHoje(itemIds)
  if (resultado.error) return resultado
  return { success: true, itemIds }
}
