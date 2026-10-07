"use server"

import { revalidatePath } from "next/cache"
import { mensagemDeErro } from "@/lib/erros"
import { getUsuarioEIgreja } from "@/lib/auth-contexto"
import type { Cliente } from "@/types/database"

const NOME_MAX = 100
const TELEFONE_MAX = 30

type Resultado = { error?: string; success?: boolean }

// Cliente cadastrado aparece também em Nova Venda e na edição de Contas a
// Receber (#56) — criar, renomear ou arquivar precisa atualizar essas telas
// também, não só a de Clientes.
function revalidarTelasDeCliente() {
  revalidatePath("/cadastros/clientes")
  revalidatePath("/vendas")
  revalidatePath("/financeiro/contas-receber")
}

// Caracteres invisíveis (largura zero, word joiner, BOM): String.trim() e \s
// não removem, então "Maria" + U+200B virava um cliente diferente de
// "Maria" com aparência idêntica, e um nome só com isso passava como
// "preenchido".
const INVISIVEIS = new RegExp("[\\u200B-\\u200D\\u2060\\uFEFF]", "g")

// A validação da tela (required/maxLength) é só UX — uma chamada direta à
// action pula tudo isso, então confere de novo aqui. O nome é normalizado
// porque o índice único do banco compara só lower(btrim(nome)): sem isso,
// "Ana  Silva" e "Ana Silva" (espaço duplo) ou "José" digitado com acento
// combinante (NFD, comum em texto colado de macOS/PDF) virariam clientes
// diferentes — e a #57 soma a dívida por cliente.
function normalizarNome(bruto: string): string {
  return bruto
    .normalize("NFC")
    .replace(INVISIVEIS, "")
    .trim()
    .replace(/\s+/g, " ")
}

function lerCampos(
  formData: FormData
): { nome: string; telefone: string | null } | { error: string } {
  const nomeBruto = formData.get("nome")
  const telefoneBruto = formData.get("telefone")

  const nome = typeof nomeBruto === "string" ? normalizarNome(nomeBruto) : ""
  const telefone =
    typeof telefoneBruto === "string" ? telefoneBruto.replace(INVISIVEIS, "").trim() : ""

  if (!nome) return { error: "O nome do cliente é obrigatório" }
  if (nome.length > NOME_MAX) return { error: `O nome pode ter no máximo ${NOME_MAX} caracteres` }
  if (telefone.length > TELEFONE_MAX) {
    return { error: `O telefone pode ter no máximo ${TELEFONE_MAX} caracteres` }
  }

  return { nome, telefone: telefone || null }
}

function mensagemDeErroCliente(error: { code?: string; message: string }): string {
  // 23505 aqui só pode ser o índice único de nome (a PK é gerada pelo banco).
  if (error.code === "23505") {
    return "Já existe um cliente com esse nome (ele pode estar arquivado)."
  }
  return mensagemDeErro(error)
}

export async function listarClientes(): Promise<Cliente[]> {
  const { supabase, user, igrejaId } = await getUsuarioEIgreja()
  if (!user || !igrejaId) return [] as Cliente[]

  const { data, error } = await supabase
    .from("tab_clientes")
    .select("*")
    .eq("igreja_id", igrejaId)
    .order("nome")

  if (error) return [] as Cliente[]
  return (data ?? []) as Cliente[]
}

// Devolve o cliente criado: Nova Venda cadastra "na hora" e já seleciona.
export async function criarCliente(
  formData: FormData
): Promise<Resultado & { cliente?: Cliente }> {
  const { supabase, user, igrejaId } = await getUsuarioEIgreja()
  if (!user) return { error: "Não autenticado" }
  if (!igrejaId) return { error: "Nenhuma igreja associada à sua conta" }

  const campos = lerCampos(formData)
  if ("error" in campos) return { error: campos.error }

  const { data, error } = await supabase
    .from("tab_clientes")
    .insert({
      nome: campos.nome,
      telefone: campos.telefone,
      ativo: true,
      user_id: user.id,
      igreja_id: igrejaId,
    })
    .select("*")
    .single()

  if (error) return { error: mensagemDeErroCliente(error) }
  revalidarTelasDeCliente()
  return { success: true, cliente: data as Cliente }
}

export async function editarCliente(id: string, formData: FormData): Promise<Resultado> {
  const { supabase, user, igrejaId } = await getUsuarioEIgreja()
  if (!user) return { error: "Não autenticado" }
  if (!igrejaId) return { error: "Nenhuma igreja associada à sua conta" }

  const campos = lerCampos(formData)
  if ("error" in campos) return { error: campos.error }

  // .select("id") só pra saber se alguma linha foi mesmo atualizada: um id
  // de outra igreja (ou inexistente) não casa com o filtro de igreja_id e
  // o UPDATE "dá certo" com 0 linhas — sem conferir, a tela mostraria
  // "Cliente atualizado!" sem ter atualizado nada.
  const { data, error } = await supabase
    .from("tab_clientes")
    .update({ nome: campos.nome, telefone: campos.telefone })
    .eq("id", id)
    .eq("igreja_id", igrejaId)
    .select("id")

  if (error) return { error: mensagemDeErroCliente(error) }
  if (!data || data.length === 0) return { error: "Cliente não encontrado" }
  revalidarTelasDeCliente()
  return { success: true }
}

async function definirAtivo(id: string, ativo: boolean): Promise<Resultado> {
  const { supabase, user, igrejaId } = await getUsuarioEIgreja()
  if (!user) return { error: "Não autenticado" }
  if (!igrejaId) return { error: "Nenhuma igreja associada à sua conta" }

  const { data, error } = await supabase
    .from("tab_clientes")
    .update({ ativo })
    .eq("id", id)
    .eq("igreja_id", igrejaId)
    .select("id")

  if (error) return { error: mensagemDeErro(error) }
  if (!data || data.length === 0) return { error: "Cliente não encontrado" }
  revalidarTelasDeCliente()
  return { success: true }
}

export async function arquivarCliente(id: string): Promise<Resultado> {
  return definirAtivo(id, false)
}

export async function reativarCliente(id: string): Promise<Resultado> {
  return definirAtivo(id, true)
}
