"use server"

import { revalidatePath } from "next/cache"
import { mensagemDeErro } from "@/lib/erros"
import { diaFechado } from "@/lib/fechamento"
import { dataBR, hojeBR, limitesDiaBR } from "@/lib/data-br"
import { getUsuarioEIgreja } from "@/lib/auth-contexto"
import { cancelarVenda } from "@/app/actions/vendas"
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
    conta_pagar_id: id,
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

export async function excluirContaReceber(id: string): Promise<{ error?: string; success?: boolean; vendaCancelada?: boolean }> {
  const { supabase, user, igrejaId } = await getUsuarioEIgreja()
  if (!user) return { error: "Não autenticado" }
  if (!igrejaId) return { error: "Nenhuma igreja associada à sua conta" }

  const { data: conta } = await supabase
    .from("tab_contas_receber")
    .select("venda_id, valor_devido")
    .eq("id", id)
    .eq("igreja_id", igrejaId)
    .eq("pago", false)
    .maybeSingle()

  if (!conta) return { error: "Conta não encontrada ou já recebida. Não é possível excluir." }

  // #13: toda linha de tab_contas_receber nasce de uma venda fiado. Excluir
  // só a conta, sem tocar na venda de origem, deixava tab_vendas com
  // status="pendente"/forma_pagamento="fiado" pra sempre — sem nenhuma
  // conta a receber pra cobrar (o fiado "some"). Se a conta ainda representa
  // o mesmo VALOR que a venda registrou (comparação só por valor, não por
  // cliente — corrigir só o nome do cliente não muda de quem é o dinheiro,
  // então não deveria impedir cancelar a venda junto) e a venda ainda não
  // está cancelada, excluir aqui cancela a venda de origem também — mesmo
  // caminho de cancelarVenda, que já cuida de apagar/desvincular esta mesma
  // linha no fim com a trava certa contra corrida (ver #13 em cancelarVenda).
  //
  // Se o VALOR foi editado (ex.: R$20 virou R$30 pra juntar consumo de
  // outro dia), não tratamos como "a mesma dívida": cancelar a venda
  // cancelaria algo que não corresponde mais ao que essa conta representa
  // hoje. Nesse caso só apaga a conta, mantendo o comportamento antigo.
  //
  // Se a venda já está cancelada (dado antigo, de antes de cancelarVenda
  // apagar a conta ligada — corrigido, mas pode haver contas órfãs de
  // vendas canceladas nesse meio tempo), cancelarVenda só devolveria erro
  // ("Esta venda já foi cancelada") e travaria a exclusão pra sempre. Pula
  // direto pro DELETE.
  let vendaCancelada = false
  if (conta.venda_id) {
    const { data: venda, error: errVenda } = await supabase
      .from("tab_vendas")
      .select("status, total")
      .eq("id", conta.venda_id)
      .eq("igreja_id", igrejaId)
      .maybeSingle()

    // Erro de leitura (não "não encontrada") não pode ser tratado como
    // "conta editada, só apaga" em silêncio — abortar é mais seguro do que
    // arriscar apagar uma conta que na verdade ainda era a própria venda.
    if (errVenda) return { error: mensagemDeErro(errVenda) }

    const naoFoiEditada = venda !== null &&
      Math.round(venda.total * 100) === Math.round(conta.valor_devido * 100)

    if (naoFoiEditada && venda!.status !== "cancelado") {
      const resultado = await cancelarVenda(conta.venda_id)
      if (resultado.error) return resultado
      vendaCancelada = true
    }
  }

  // Roda mesmo depois de cancelarVenda ter sucesso: idempotente nesse caso
  // (0 linhas não é erro — cancelarVenda já pode ter apagado) e garante que
  // a conta não fica presa se o delete interno dele tiver falhado em
  // silêncio. Mas se NINGUÉM tentou tocar na venda (vendaCancelada=false, o
  // único delete é este), 0 linhas significa que a conta sumiu por outra
  // operação concorrente (recebida ou excluída por outra pessoa) — reportar
  // isso em vez de um "excluído!" falso.
  const { data: linhasApagadas, error } = await supabase
    .from("tab_contas_receber")
    .delete()
    .eq("id", id)
    .eq("igreja_id", igrejaId)
    .eq("pago", false)
    .select("id")

  if (error) return { error: mensagemDeErro(error) }
  if (!vendaCancelada && (!linhasApagadas || linhasApagadas.length === 0)) {
    return { error: "Conta não encontrada ou já recebida. Não é possível excluir." }
  }
  revalidatePath("/financeiro/contas-receber")
  return { success: true, vendaCancelada }
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
  // Guardado pra usar mais abaixo, no ramo de corrida com cancelarVenda —
  // total não muda depois que a venda é criada, então esta mesma leitura
  // continua válida lá (só o status pode ter mudado entre os dois pontos).
  let vendaTotalNoInicio: number | undefined
  if (vendaId) {
    const { data: venda } = await supabase
      .from("tab_vendas")
      .select("status, total")
      .eq("id", vendaId)
      .eq("igreja_id", igrejaId)
      .single()

    if (venda?.status === "cancelado") {
      return { error: "A venda desta conta foi cancelada. Não é possível receber." }
    }
    vendaTotalNoInicio = venda?.total
  }

  if (await diaFechado(supabase, igrejaId, hojeBR())) {
    return { error: "O caixa de hoje já foi fechado. Não é possível registrar recebimentos." }
  }

  // .eq("pago", false) torna esse update atômico — mesma razão do
  // pagarConta: com mais de um membro na mesma igreja, dois recebimentos
  // quase simultâneos do mesmo fiado não podem gerar duas entradas.
  //
  // .eq("valor_devido", c.valor_devido) trava o valor no momento exato da
  // baixa (#13): sem isso, um editarContaReceber concorrente entre a
  // leitura acima e este update deixaria `c.valor_devido` (usado mais
  // abaixo pra decidir apagar-ou-desvincular a conta numa corrida com
  // cancelarVenda, e pro valor lançado no extrato) desatualizado em
  // relação ao valor de verdade que acabou de ser recebido.
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
    .eq("valor_devido", (conta as ContaReceber).valor_devido)
    .select("id")

  if (error) return { error: mensagemDeErro(error) }
  if (!linhas || linhas.length === 0) {
    return { error: "Esta conta foi alterada ou já recebida por outra pessoa. Atualize a página e tente de novo." }
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
      // tentou apagar/desvincular esta conta a receber, mas nesse instante
      // `pago` ainda não tinha virado true (update lá em cima ainda não
      // tinha commitado no momento do DELETE/UPDATE de cancelarVenda),
      // então a conta sobreviveu com pago=true. #13: mesma trava de valor —
      // se `valor_devido` ainda bate com o total da venda (não foi editada
      // nesse meio tempo), apaga como antes. Se não bate, desvincula e
      // desfaz a baixa em vez de apagar dinheiro sem relação com a venda
      // cancelada (a conta volta a ficar em aberto, sem venda de origem).
      const naoFoiEditada = vendaTotalNoInicio !== undefined &&
        Math.round(vendaTotalNoInicio * 100) === Math.round(c.valor_devido * 100)

      if (naoFoiEditada) {
        await supabase
          .from("tab_contas_receber")
          .delete()
          .eq("id", id)
          .eq("igreja_id", igrejaId)
          .eq("pago", true)
      } else {
        await supabase
          .from("tab_contas_receber")
          .update({ venda_id: null, pago: false, data_baixa: null, forma_pagamento_baixa: null })
          .eq("id", id)
          .eq("igreja_id", igrejaId)
          .eq("pago", true)
      }
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

// #8: só edita/exclui movimentação com conta_pagar_id preenchido (despesa
// paga por pagarConta). Linhas de venda/fiado (venda_id) são geridas em
// Vendas/Contas a Receber, que já sincronizam venda<->conta com segurança
// (#13) — editar/excluir aqui direto reabriria o mesmo tipo de dessincronia,
// só que sem a trava de valor que aquela issue construiu.
export async function editarMovimentacaoExtrato(
  id: string,
  dados: { valor: number; descricao: string }
): Promise<{ error?: string; success?: boolean }> {
  const { supabase, user, igrejaId } = await getUsuarioEIgreja()
  if (!user) return { error: "Não autenticado" }
  if (!igrejaId) return { error: "Nenhuma igreja associada à sua conta" }

  if (!dados.descricao || isNaN(dados.valor) || dados.valor <= 0) {
    return { error: "Preencha todos os campos obrigatórios" }
  }

  const { data: movimentacao } = await supabase
    .from("tab_extrato_financeiro")
    .select("data_hora, conta_pagar_id")
    .eq("id", id)
    .eq("igreja_id", igrejaId)
    .maybeSingle()

  if (!movimentacao) return { error: "Movimentação não encontrada" }
  if (!movimentacao.conta_pagar_id) {
    return { error: "Só despesas pagas (lançadas por Contas a Pagar) podem ser editadas aqui. Vendas e recebimentos de fiado são geridos nas telas de Vendas e Contas a Receber." }
  }
  if (await diaFechado(supabase, igrejaId, dataBR(movimentacao.data_hora))) {
    return { error: "O caixa deste dia já foi fechado. Não é possível editar." }
  }

  // Sem forma_pagamento de propósito (achado do financeiro-reviewer): o
  // fechamento (fechar_caixa e calcularResumo) desconta TODA saída do
  // dinheiro em caixa, sem olhar a forma — funciona hoje porque pagarConta
  // sempre grava "dinheiro". Deixar editar pra pix/cartão faria uma saída
  // paga por PIX ser descontada da gaveta de dinheiro, gerando uma
  // "diferença" falsa no fechamento.
  // .select("id") + checagem de 0 linhas: sem isso, editar uma linha que
  // acabou de ser excluída (por outra pessoa, entre a leitura lá em cima e
  // este update) passava como sucesso silencioso e ainda gravava o valor
  // editado em tab_contas_pagar mais abaixo — reabrindo a mesma divergência
  // do achado 2, só que pelo lado da edição (achado do financeiro-reviewer).
  const { data: linhasEditadas, error } = await supabase
    .from("tab_extrato_financeiro")
    .update({ valor: dados.valor, descricao: dados.descricao })
    .eq("id", id)
    .eq("igreja_id", igrejaId)
    .select("id")

  if (error) return { error: mensagemDeErro(error) }
  if (!linhasEditadas || linhasEditadas.length === 0) {
    return { error: "Movimentação não encontrada. Atualize a página." }
  }

  // Mantém tab_contas_pagar.valor/descricao em sincronia com o que o
  // extrato realmente registra — senão Contas a Pagar mostraria um valor
  // "pago" diferente do que saiu do caixa, e excluir a movimentação depois
  // reabriria a conta com o valor ERRADO (o antigo, não o editado).
  const { error: errContaPagar } = await supabase
    .from("tab_contas_pagar")
    .update({ valor: dados.valor, descricao: dados.descricao })
    .eq("id", movimentacao.conta_pagar_id)
    .eq("igreja_id", igrejaId)
    .eq("pago", true)

  if (errContaPagar) return { error: mensagemDeErro(errContaPagar) }

  revalidatePath("/financeiro/extrato")
  revalidatePath("/financeiro/contas-pagar")
  revalidatePath("/financeiro/fechamento")
  return { success: true }
}

export async function excluirMovimentacaoExtrato(id: string): Promise<{ error?: string; success?: boolean }> {
  const { supabase, user, igrejaId } = await getUsuarioEIgreja()
  if (!user) return { error: "Não autenticado" }
  if (!igrejaId) return { error: "Nenhuma igreja associada à sua conta" }

  const { data: movimentacao } = await supabase
    .from("tab_extrato_financeiro")
    .select("data_hora, conta_pagar_id")
    .eq("id", id)
    .eq("igreja_id", igrejaId)
    .maybeSingle()

  if (!movimentacao) return { error: "Movimentação não encontrada" }
  if (!movimentacao.conta_pagar_id) {
    return { error: "Só despesas pagas (lançadas por Contas a Pagar) podem ser excluídas aqui. Vendas são canceladas na tela de Vendas; recebimento de fiado não pode ser desfeito por aqui." }
  }
  if (await diaFechado(supabase, igrejaId, dataBR(movimentacao.data_hora))) {
    return { error: "O caixa deste dia já foi fechado. Não é possível excluir." }
  }

  // Apaga a movimentação ANTES de reabrir a conta em Contas a Pagar
  // (ordem importa — achado do financeiro-reviewer): se fosse o contrário,
  // uma janela entre os dois passos deixaria a conta "em aberto" enquanto
  // a saída original ainda existe no extrato — pagarConta rodando nesse
  // meio tempo lançaria uma SEGUNDA saída pra mesma despesa, e se o delete
  // desta linha falhasse depois (dia fechado nesse instante, erro de
  // rede), o rollback devolveria pago=true mas as duas saídas ficariam
  // contando no caixa. Apagando primeiro (exigindo exatamente 1 linha
  // afetada), a conta continua pago=true sem saída até o segundo passo —
  // pagarConta rejeita "já foi paga" nesse intervalo, então não tem como
  // duplicar.
  const { data: linhasApagadas, error } = await supabase
    .from("tab_extrato_financeiro")
    .delete()
    .eq("id", id)
    .eq("igreja_id", igrejaId)
    .select("id")

  if (error) return { error: mensagemDeErro(error) }
  if (!linhasApagadas || linhasApagadas.length === 0) {
    return { error: "Movimentação não encontrada. Atualize a página." }
  }

  // Desfaz o pagamento da despesa ligada — senão ela ficava "paga" pra
  // sempre em Contas a Pagar sem nenhuma saída no caixa que sustente esse
  // status. Se isso falhar aqui, a movimentação já foi apagada mas a
  // conta continua "paga" sem saída — estado que trava (não deixa
  // duplicar dinheiro) e pode ser corrigido manualmente no Supabase; não
  // reverte o delete porque não há como "desfazer" um delete que já
  // commitou sem arriscar reinserir dados inconsistentes.
  const { error: errContaPagar } = await supabase
    .from("tab_contas_pagar")
    .update({ pago: false })
    .eq("id", movimentacao.conta_pagar_id)
    .eq("igreja_id", igrejaId)
    .eq("pago", true)

  if (errContaPagar) return { error: mensagemDeErro(errContaPagar) }

  revalidatePath("/financeiro/extrato")
  revalidatePath("/financeiro/contas-pagar")
  revalidatePath("/financeiro/fechamento")
  return { success: true }
}
